const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    chainId: Number,
    tokenSymbol: String,
    tokenName: String,
    action: String,
    tokenAddress: String,
    amountUSDT: Number,
    amountToken: Number,
    blockNumber: Number,
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
