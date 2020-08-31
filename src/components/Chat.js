import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import firebase from "../firebase";
import { useParams } from "react-router-dom";
import openSocket from "socket.io-client";
import { Message } from "chatbits";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext";
import SearchBox from "./SearchBox";
import KeyboardArrowUpIcon from "@material-ui/icons/KeyboardArrowUp";
import { CSSTransition } from "react-transition-group";
import "./Chat.scss";
import "./Message.scss";
import "chatbits/dist/index.css";
import hasFlag from "../utils/flagFunctions/has";
import fromFlag from "../utils/flagFunctions/from";
import platformFlag from "../utils/flagFunctions/platform";
import isFlag from "../utils/flagFunctions/is";
import { TransitionGroup } from "react-transition-group";
import useHotkeys from "use-hotkeys";
import Viewers from "./Viewers";
import { useLocalStorage } from "react-use";
import sha1 from "sha1";
import ReactTextareaAutocomplete from "@webscopeio/react-textarea-autocomplete";

const Item = ({ selected, entity: { name, char } }) => <div className="auto-item">{`${name}: ${char}`}</div>;
const UserItem = ({ selected, entity: { name, char } }) => (
	<div id={name} className={`auto-item ${selected ? "selected-item" : ""}`}>{`${name}`}</div>
);
const EmoteItem = ({ selected, entity: { name, char, bttv, ffz } }) => {
	return (
		<div id={name} className={`emote-item auto-item ${selected ? "selected-item" : ""}`}>
			<img
				className="auto-fill-emote-image"
				src={
					bttv
						? `https://cdn.betterttv.net/emote/${name}/1x#emote`
						: ffz
						? `${name}#emote`
						: `https://static-cdn.jtvnw.net/emoticons/v1/${name}/1.0`
				}
				alt=""
			/>
			{char}
		</div>
	);
};

// const displayMotes = [
// 	"https://static-cdn.jtvnw.net/emoticons/v1/115847/1.0",
// 	"https://static-cdn.jtvnw.net/emoticons/v1/64138/1.0",
// 	"https://static-cdn.jtvnw.net/emoticons/v1/30259/1.0",
// 	"https://static-cdn.jtvnw.net/emoticons/v1/28087/1.0",
// 	"https://static-cdn.jtvnw.net/emoticons/v1/68856/1.0",
// 	"https://static-cdn.jtvnw.net/emoticons/v1/425618/1.0",
// ];

const flagRegex = /(\s|^)(has|from|platform|is):([^\s]*)/gim;

const handleFlags = (searchString, messages) => {
	const flags = [...searchString.matchAll(flagRegex)].map(([, , flag, parameter]) => ({ flag, parameter }));
	const flaglessSearch = searchString.replace(flagRegex, "").trim();
	let matchingMessages = [...messages].filter(msg => !flaglessSearch || msg.body.toLowerCase().includes(flaglessSearch.toLowerCase()));
	flags.forEach(({ flag, parameter }) => {
		if (flag === "has") {
			matchingMessages = hasFlag(parameter, matchingMessages);
		} else if (flag === "from") {
			matchingMessages = fromFlag(parameter, matchingMessages);
		} else if (flag === "platform") {
			matchingMessages = platformFlag(parameter, matchingMessages);
		} else if (flag === "is") {
			matchingMessages = isFlag(parameter, matchingMessages);
		}
	});
	return matchingMessages;
};

const Messages = React.memo(props => {
	return (
		<TransitionGroup>
			{props.messages.map((msg, i) => (
				<Message
					index={msg.id}
					forwardRef={props.unreadMessageHandler}
					streamerInfo={props.settings}
					delete={props.removeMessage}
					timeout={props.timeout}
					ban={props.ban}
					key={msg.id}
					msg={msg}
					pin={() => props.pin(msg.id)}
				/>
			))}
		</TransitionGroup>
	);
});

function App(props) {
	const socketRef = useRef();
	const {
		streamerInfo: settings,
		messages,
		setMessages,
		pinnedMessages,
		setPinnedMessages,
		showViewers,
		windowFocused,
		userData: userInfo,
		setUnreadMessageIds,
	} = useContext(AppContext);
	const [channel, setChannel] = useState();
	const [search, setSearch] = useState("");
	const { id } = useParams();
	const [storedMessages, setStoredMessages] = useLocalStorage(`messages - ${id}`, []);
	const [storedPinnedMessages, setStoredPinnedMessages] = useLocalStorage(`pinned messages - ${id}`, []);
	const [showToTop, setShowToTop] = useState(false);
	const [showSearch, setShowSearch] = useState(true);
	const [chatValue, setChatValue] = useState("");
	const bodyRef = useRef();
	const observerRef = useRef();
	const currentUser = firebase.auth.currentUser;
	// const [emoteIndex, setEmoteIndex] = useState(0);

	useEffect(() => {
		setMessages(storedMessages);
		setPinnedMessages(storedPinnedMessages);
	}, []);

	useEffect(() => {
		setStoredMessages(messages);
		setStoredPinnedMessages(pinnedMessages);
	}, [messages, setStoredMessages, pinnedMessages, setStoredPinnedMessages]);

	// this runs once on load, and starts the socket
	useEffect(() => {
		socketRef.current = openSocket(process.env.REACT_APP_SOCKET_URL);
	}, []);

	useEffect(() => {
		return () => {
			if (socketRef.current) {
				socketRef.current.disconnect();
			}
		};
	}, [socketRef]);

	useHotkeys(
		(key, event, handle) => {
			switch (key) {
				case "ctrl+f":
					setSearch("");
					setShowSearch(true);
					document.getElementById("chat-search").focus();
					break;
				case "esc":
					setShowSearch(false);
					setSearch("");
					break;
				default:
					break;
			}
		},
		["ctrl+f", "esc"],
		[]
	);

	// this function is passed into the message and will be used for pinning
	const pinMessage = useCallback(
		id => {
			const pinning = !!messages.find(msg => msg.id === id);
			if (pinning) {
				//move message from messages to pinned messages
				setMessages(prev => {
					let copy = [...prev];
					let index = copy.findIndex(msg => msg.id === id);
					copy[index].pinned = true;
					const pinnedMessage = copy.splice(index, 1);
					setPinnedMessages(prev => [...prev, ...pinnedMessage]);
					return copy;
				});
			} else {
				setPinnedMessages(prev => {
					let copy = [...prev];
					let index = copy.findIndex(msg => msg.id === id);
					copy[index].pinned = false;
					const unPinnedMessage = copy.splice(index, 1);
					setMessages(prev => [...prev, ...unPinnedMessage].sort((a, b) => a.sentAt - b.sentAt));
					return copy;
				});
			}
		},
		[setMessages, setPinnedMessages, messages]
	);

	const ban = useCallback(
		async (id, platform) => {
			if (platform && socketRef.current) {
				let modName = userInfo.name;
				if (!modName) {
					console.log("attempting to obtain username");
					const UserData = (await firebase.db.collection("Streamers").doc(currentUser.uid).get()).data();
					modName = UserData.name;
				}

				const banMsg = messages.find(msg => msg.id === id);
				socketRef.current.emit(`banuser - ${platform}`, {
					modName,
					user: banMsg?.[platform === "discord" ? "userId" : "displayName"],
				});
			}
		},
		[socketRef, messages, userInfo, currentUser]
	);

	const timeout = useCallback(
		async (id, platform) => {
			if (platform && socketRef.current) {
				const banMsg = messages.find(msg => msg.id === id);
				// on discord we delete by userId and on twitch we delete by username
				let modName = userInfo.name;
				if (!modName) {
					console.log("attempting to obtain username");
					const UserData = (await firebase.db.collection("Streamers").doc(currentUser.uid).get()).data();
					modName = UserData.name;
				}
				socketRef.current.emit(`timeoutuser - ${platform}`, {
					modName,
					user: banMsg?.[platform === "discord" ? "userId" : "displayName"],
				});
			}
		},
		[socketRef, messages, userInfo, currentUser]
	);

	// this is used to delete messages, in certain conditions will also send a message to backend tell it to delete the message from the sent platform
	const removeMessage = useCallback(
		async (id, platform) => {
			setMessages(prev => {
				let copy = [...prev];
				let index = copy.findIndex(msg => msg.id === id);
				if (index === -1) return prev;
				copy.splice(index, 1);
				return copy;
			});

			let modName = userInfo.name;
			if (!modName) {
				console.log("attempting to obtain username");
				const UserData = (await firebase.db.collection("Streamers").doc(currentUser.uid).get()).data();
				modName = UserData.name;
			}

			if (platform && socketRef.current) {
				socketRef.current.emit(`deletemsg - ${platform}`, { id, modName });
			}
		},
		[socketRef, setMessages, userInfo, currentUser]
	);

	// this is run whenever the socket changes and it sets the chatmessage listener on the socket to listen for new messages from the backend
	useEffect(() => {
		if (socketRef.current) {
			socketRef.current.removeListener("chatmessage");
			socketRef.current.on("chatmessage", msg => {
				if (msg.replyParentDisplayName) {
					msg.body = `<span class="reply-header">Replying to ${msg.replyParentDisplayName}</span>\n${msg.body}`.replace(`@${msg.replyParentDisplayName}`, "");
				}
				setMessages(m => {
					// by default we don't ignore messages
					if (messages.findIndex(message => message.id === msg.id) !== -1) return m;
					let ignoredMessage = false;

					// check if we should ignore this user
					if (settings?.IgnoredUsers?.map?.(item => item.value.toLowerCase()).includes(msg.displayName.toLowerCase())) {
						ignoredMessage = true;
					}

					// check if the message is a command
					const _ = settings?.IgnoredCommandPrefixes?.forEach(prefix => {
						if (msg.body.startsWith(prefix.value)) {
							ignoredMessage = true;
						}
					});

					// don't allow ignoring of notifications from 'disstreamchat'
					if (msg.displayName.toLowerCase() === "disstreamchat") ignoredMessage = false;

					if (settings?.IgnoreCheers && msg.messageId === "cheer") {
						ignoredMessage = true;
					}
					if (settings?.IgnoreFollows && msg.messageId === "follow") {
						ignoredMessage = true;
					}
					if (settings?.IgnoreSubscriptions && msg.messageId === "subscription" && msg.messageType !== "channel-points") {
						ignoredMessage = true;
					}
					if (settings?.IgnoreChannelPoints && msg.messageType === "channel-points") {
						ignoredMessage = true;
					}

					// if ignored don't add the message
					if (ignoredMessage) return m;

					// add a <p></p> around the message to make formatting work properly also hightlight pings
					msg.body = `<p>${msg.body.replace(
						new RegExp(`(?<=\s|^)(${userInfo?.name}|@${userInfo?.name})`, "ig"),
						"<span class='ping'>$&</span>"
					)}</p>`;

					// check if the message can have mod actions done on it
					msg.moddable =
						msg?.displayName?.toLowerCase?.() !== userInfo?.name?.toLowerCase?.() &&
						!Object.keys(msg.badges).includes("moderator") &&
						!Object.keys(msg.badges).includes("broadcaster");

					if (
						msg.platform !== "discord" &&
						msg?.displayName?.toLowerCase?.() !== userInfo?.name?.toLowerCase?.() &&
						channel?.TwitchName?.toLowerCase?.() === userInfo?.name?.toLowerCase?.()
					)
						msg.moddable = true;
					if (msg.displayName.toLowerCase() === "disstreamchat") msg.moddable = false;

					setUnreadMessageIds(prev => [...new Set([...prev, msg.id])]);

					if (settings?.ReverseMessageOrder) {
						const shouldScroll = Math.abs(bodyRef.current.scrollTop - bodyRef.current.scrollHeight) < 1200;
						setTimeout(() => {
							if (shouldScroll) {
								bodyRef.current.scrollTo({
									top: bodyRef.current.scrollHeight,
									behavior: "smooth",
								});
							}
						}, 200);
					}

					return [...m.slice(-Math.max(settings.MessageLimit, 100)), { ...msg, read: false }];
				});
			});
			return () => socketRef.current.removeListener("chatmessage");
		}
	}, [settings, socketRef, setMessages, userInfo, channel, setUnreadMessageIds, messages]);

	// this is run whenever the socket changes and it sets the chatmessage listener on the socket to listen for new messages from the backend
	useEffect(() => {
		if (socketRef.current) {
			socketRef.current.removeListener("imConnected");
			socketRef.current.on("imConnected", () => {
				if (channel) {
					socketRef.current.emit("addme", channel);
				}
			});
			return () => socketRef.current.removeListener("imConnected");
		}
	}, [settings, socketRef, channel]);

	useEffect(() => {
		setMessages(m => m.slice(-Math.max(settings.MessageLimit, 100)));
	}, [settings, setMessages]);

	// this is similar to the above useEffect but for adds a listener for when messages are deleted
	useEffect(() => {
		if (socketRef.current) {
			socketRef.current.removeListener("deletemessage");
			socketRef.current.on("deletemessage", removeMessage);
			return () => socketRef.current.removeListener("deletemessage");
		}
	}, [socketRef, removeMessage]);

	useEffect(() => {
		if (socketRef.current) {
			socketRef.current.removeListener("updateMessage");
			socketRef.current.on("updateMessage", newMessage => {
				setMessages(m => {
					const copy = [...m];
					const messageToUpdate = m.find(msg => msg.id === newMessage.id);
					if (!messageToUpdate) return m;
					const updatedMessage = { ...messageToUpdate, body: newMessage.body };
					const messageToUpdateIndex = m.findIndex(msg => msg.id === newMessage.id);
					copy.splice(messageToUpdateIndex, 1, updatedMessage);
					return copy;
				});
			});
			return () => socketRef.current.removeListener("updateMessage");
		}
	}, [socketRef, removeMessage, setMessages]);

	// this is similar to the above useEffect but for adds a listener for when messages are deleted
	useEffect(() => {
		if (socketRef.current) {
			socketRef.current.removeListener("purgeuser");
			socketRef.current.on("purgeuser", username => {
				setMessages(prev => prev.filter(msg => msg.displayName?.toLowerCase() !== username.toLowerCase()));
			});
			return () => socketRef.current.removeListener("purgeuser");
		}
	}, [socketRef, removeMessage, setMessages]);

	useEffect(() => {
		const unsub = firebase.db
			.collection("Streamers")
			.doc(sha1(id))
			.onSnapshot(async snapshot => {
				const data = snapshot.data();
				if (!data) {
					const apiUrl = `${process.env.REACT_APP_SOCKET_URL}/resolveuser?user=${id}&platform=twitch`;
					const response = await fetch(apiUrl);
					const userData = await response.json();
					setChannel({
						TwitchName: userData?.display_name?.toLowerCase?.(),
					});
				} else {
					const { guildId, liveChatId, twitchId } = data;
					const apiUrl = `${process.env.REACT_APP_SOCKET_URL}/resolveuser?user=${twitchId}&platform=twitch`;
					const response = await fetch(apiUrl);
					const userData = await response.json();
					const TwitchName = userData?.display_name?.toLowerCase?.() || data.TwitchName;
					setChannel({
						TwitchName,
						guildId,
						liveChatId,
					});
				}
			});
		return unsub;
	}, [id]);

	useEffect(() => {
		if (channel) {
			// send info to backend with sockets, to get proper socket connection
			if (socketRef.current) {
				socketRef.current.emit("addme", channel);
			}
		}
	}, [channel, socketRef]);

	const ReverseMessageOrder = settings?.ReverseMessageOrder;

	useEffect(() => {
		setTimeout(() => {
			if (ReverseMessageOrder) {
				bodyRef.current.scrollTo({
					top: bodyRef.current.scrollHeight,
					// behavior: "smooth",
				});
			} else {
				bodyRef.current.scrollTo({
					top: 0,
					// behavior: "smooth",
				});
			}
		}, 100);
	}, [ReverseMessageOrder]);

	const handleSearch = useCallback(setSearch, []);

	const scrollTop = useCallback(() => {
		setUnreadMessageIds([]);
		bodyRef.current.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	}, [setUnreadMessageIds]);

	useEffect(() => {
		bodyRef.current.addEventListener("scroll", e => {
			setShowToTop(prev => bodyRef.current.scrollTop > 600);
		});
	}, []);

	const checkReadMessage = useCallback(
		node => {
			if (!node) return;
			if (!observerRef.current) {
				observerRef.current = new IntersectionObserver((entries, observer) => {
					entries.forEach(entry => {
						if (entry.isIntersecting) {
							const idx = entry.target.dataset.idx;
							setUnreadMessageIds(prev => prev.filter(id => id !== idx));
							const elt = document.querySelector(`div[data-idx="${idx}"]`);
							observer.unobserve(elt);
						}
					});
				});
			}
			if (observerRef.current && node) {
				try {
					observerRef.current.observe(node);
				} catch (err) {
					console.log(node);
				}
			}
		},
		[observerRef, setUnreadMessageIds]
	);

	const [chatterInfo, setChatterInfo] = useState();
	const [chatterCount, setChatterCount] = useState();
	const [streamerName, setStreamerName] = useState();
	const [allChatters, setAllChatters] = useState();
	const userId = id;

	useEffect(() => {
		let id;
		(async () => {
			let userName = streamerName;
			if (!userName) {
				const apiUrl = `${process.env.REACT_APP_SOCKET_URL}/resolveuser?user=${userId}&platform=twitch`;
				const response = await fetch(apiUrl);
				const userData = await response.json();
				userName = userData?.display_name?.toLowerCase?.();
				setStreamerName(userName);
			}
			const chatterUrl = `${process.env.REACT_APP_SOCKET_URL}/chatters?user=${userName}`;
			const getChatters = async () => {
				const response = await fetch(chatterUrl);
				const json = await response.json();
				if (json && response.ok) {
					const info = {};
					const chatters = [];
					for (let [key, value] of Object.entries(json.chatters)) {
						if (value.length === 0) continue;
						info[key] = await Promise.all(
							value.map(async name => {
								chatters.push(name);
								const response = await fetch(`${process.env.REACT_APP_SOCKET_URL}/resolveuser?user=${name}&platform=twitch`);
								return await response.json();
							})
						);
					}

					setChatterInfo(info);
					setChatterCount(json.chatter_count);
					setAllChatters(chatters);
				}
			};
			getChatters();
			id = setInterval(getChatters, 120000 * 2);
		})();
		return () => clearInterval(id);
	}, [userId, streamerName]);

	const [userEmotes, setUserEmotes] = useState([]);
	useEffect(() => {
		(async () => {
			const apiUrl = `${process.env.REACT_APP_SOCKET_URL}/emotes?user=${userInfo.TwitchName}`;
			const customApiUrl = `${process.env.REACT_APP_SOCKET_URL}/customemotes?channel=${channel?.TwitchName}`;
			let [emotes, customEmotes] = await Promise.all([
				(async () => {
					const response = await fetch(apiUrl);
					return response.json();
				})(),
				(async () => {
					const response = await fetch(customApiUrl);
					return response.json();
				})(),
			]);

			emotes = emotes.emoticon_sets;
			if (emotes) {
				let allEmotes = [];
				for (let [key, value] of Object.entries(emotes)) {
					allEmotes = [...allEmotes, ...value.map(emote => ({ ...emote, channelId: key }))];
				}
				for (const [key, value] of Object.entries(customEmotes?.bttv?.bttvEmotes || {})) {
					allEmotes.push({ code: key, name: value, char: key, bttv: true });
				}
				for (const [key, value] of Object.entries(customEmotes?.ffz?.ffzEmotes || {})) {
					allEmotes.push({ code: key, name: value, char: key, ffz: true });
				}
				setUserEmotes(allEmotes);
			}
		})();
	}, [userInfo, channel]);

	const flagMatches = useMemo(
		() =>
			handleFlags(showSearch ? search : "", [...messages, ...pinnedMessages])
				.filter(msg => !msg.deleted)
				.sort((a, b) => a.sentAt - b.sentAt),
		[messages, search, showSearch, pinnedMessages]
	);

	const sendMessage = useCallback(() => {
		if (socketRef.current) {
			if (chatValue.startsWith("/clear")) {
				setMessages([]);
				return;
			}
			socketRef.current.emit("sendchat", {
				sender: userInfo?.name?.toLowerCase?.(),
				message: chatValue,
			});
		}
	}, [socketRef, chatValue, userInfo, setMessages]);

	return showViewers ? (
		<span style={{ fontFamily: settings.Font }}>
			<Viewers streamer={streamerName} chatterCount={chatterCount} chatterInfo={chatterInfo} />
		</span>
	) : (
		<div style={{ fontFamily: settings.Font }} ref={bodyRef} className="overlay-container">
			<div className={`overlay ${settings?.ReverseMessageOrder ? "reversed" : ""} ${windowFocused ? "focused" : "unfocused"}`}>
				<CSSTransition unmountOnExit classNames="chat-node" timeout={200} in={windowFocused}>
					<div
						id="chat-input--container"
						onClick={() => {
							document.getElementById("chat-input").focus();
						}}
					>
						<ReactTextareaAutocomplete
							onItemHighlighted={({ item }) => {
								setTimeout(() => {
									const name = item?.name;
									const node = document.getElementById(name);
									if (node) {
										const _ = node.parentNode?.parentNode?.parentNode?.scrollTo?.({
											top: node?.offsetTop,
											left: 0,
											behavior: "smooth",
										});
									}
								}, 100);
							}}
							movePopupAsYouType
							loadingComponent={() => <span>Loading</span>}
							minChar={2}
							listClassName="auto-complete-dropdown"
							trigger={{
								"@": {
									dataProvider: token => {
										return allChatters
											.filter(chatter => chatter.startsWith(token))
											.map(chatter => ({ name: `${chatter}`, char: `@${chatter}` }));
									},
									component: UserItem,
									output: (item, trigger) => item.char,
								},
								":": {
									dataProvider: token => {
										return userEmotes
											.filter(emote => emote?.code?.toLowerCase?.()?.includes?.(token?.toLowerCase?.()))
											.map(emote => ({
												name: `${emote.id || emote.name}`,
												char: `${emote.code}`,
												bttv: emote.bttv,
												ffz: emote.ffz,
											}));
									},
									component: EmoteItem,
									output: (item, trigger) => item.char,
								},
							}}
							onKeyPress={e => {
								if (e.which === 13 && !e.shiftKey) {
									sendMessage();
									setChatValue("");
									e.preventDefault();
								}
							}}
							name="chat-input"
							id="chat-input"
							rows="4"
							value={chatValue}
							onChange={e => {
								setChatValue(e.target.value);
							}}
						></ReactTextareaAutocomplete>
						{/* will be used in the future */}
						{/* <Tooltip title="Emote Picker" arrow>
							<img
								src={displayMotes[emoteIndex]}
								onMouseEnter={() => {
									setEmoteIndex(Math.floor(Math.random() * displayMotes.length));
								}}
								alt=""
							/>
						</Tooltip> */}
					</div>
				</CSSTransition>
				<Messages
					messages={flagMatches}
					settings={settings}
					timeout={timeout}
					removeMessage={removeMessage}
					ban={ban}
					unreadMessageHandler={checkReadMessage}
					pin={pinMessage}
				/>
				<CSSTransition unmountOnExit timeout={200} classNames="search-node" in={showSearch && windowFocused ? true : !!search.length}>
					<SearchBox
						onKeyDown={e => {
							if (e.key === "Escape") {
								setShowSearch(false);
							}
						}}
						id="chat-search"
						value={search}
						onChange={handleSearch}
						placeHolder="Search Messages"
					/>
				</CSSTransition>
			</div>
			<CSSTransition unmountOnExit timeout={400} classNames={"to-top-node"} in={showToTop && !settings?.ReverseMessageOrder}>
				<button className="back-to-top-button fade-in" onClick={scrollTop}>
					<KeyboardArrowUpIcon></KeyboardArrowUpIcon>
				</button>
			</CSSTransition>
		</div>
	);
}

export default React.memo(App);
