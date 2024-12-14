require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Web3 } = require('web3');
const Transaction = require('./models/transactions.model');

const QuickNodeURL = process.env.QUICKNODE_URL;
const MongoURI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const app = express();

mongoose.connect(MongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const web3 = new Web3(new Web3.providers.WebsocketProvider(QuickNodeURL));

const ERC20_ABI = [
    { "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "type": "function" },
    { "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "type": "function" }
];

// USDT contract address on BSC
const USDT_ADDRESS = '0x55d398326f99059ff775485246999027b3197955';

// Listen to pending transactions from the BSC mempool
web3.eth.subscribe('pendingTransactions', async (error, txHash) => {
    console.log(error);
    console.log(txHash);
    
    if (error) {
        console.error('Subscription error:', error);
        return;
    }

    try {
        const tx = await web3.eth.getTransaction(txHash);
        if (!tx || !tx.to) return; // Skip if transaction is invalid or doesn't have a 'to' address

        // If the transaction is related to USDT token contract
        if (tx.to && tx.to.toLowerCase() === USDT_ADDRESS.toLowerCase()) {
            await processTransaction(tx);
        }
    } catch (err) {
        console.error('Error fetching transaction:', err);
    }
});

// Process transaction and save it to MongoDB
async function processTransaction(tx) {
    const input = tx.input;

    try {
        // Decode the transaction input (assuming it's a PancakeSwap-like transaction)
        const decoded = web3.eth.abi.decodeParameters([
            'uint256', // Amount in
            'uint256', // Amount out min
            'address[]', // Path (token addresses)
            'address', // Recipient address
            'uint256' // Deadline
        ], input.slice(10)); // Skip method signature (first 10 characters)

        const tokenAddress = decoded[2][1]; // Get the token address from the path
        const amountUSDT = web3.utils.fromWei(tx.value, 'ether'); // USDT amount
        const amountToken = web3.utils.fromWei(decoded[1], 'ether'); // Token amount

        // Fetch token metadata (symbol and name)
        const tokenContract = new web3.eth.Contract(ERC20_ABI, tokenAddress);
        const tokenSymbol = await tokenContract.methods.symbol().call();
        const tokenName = await tokenContract.methods.name().call();

        // Determine whether it's a buy or sell
        const action = decoded[2][0].toLowerCase() === USDT_ADDRESS.toLowerCase() ? 'Buy Token' : 'Sell Token';

        const newTransaction = new Transaction({
            chainId: 56, // BSC Chain ID
            tokenSymbol,
            tokenName,
            action,
            tokenAddress,
            amountUSDT,
            amountToken,
            blockNumber: tx.blockNumber || null,
        });

        await newTransaction.save();
        console.log('Transaction saved:', newTransaction);
    } catch (err) {
        console.error('Error processing transaction:', err);
    }
}

app.get('/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find();
        res.json(transactions);
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).send('Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
