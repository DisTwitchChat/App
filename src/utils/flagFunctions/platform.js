export default (parameter, messages) => messages.filter(message => message.platform.toLowerCase() === parameter.toLowerCase())