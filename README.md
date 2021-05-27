# Contracts

## Ecstasy

Based on RFI, Ecstasy takes a transaction fee from each transfer. 2% will be immediately distributed to other holders of the token and 3% will be added to a "pot" that will be transferred to one lucky winner at the end of each week. The logic behind the pot is very similar to the way SAFEMOON extracts liquidity, however, we will distribute the collected fees directly to lottery winners.

### Transaction Fees

**Default fee: 2%**

Transaction fees are taken from each transfer unless either the sender or recipient are excluded from fee collection. These fees will be automatically reflected in each holders balance, unless they are excluded from rewards. Accounts with larger balances will see a greater reward from this process. The default fee of 2% can be changed by the owner of the contract at any point.

### Lottery Fees

**Default fee: 3%**

Lottery fees are also taken from each transfer unless either the sender or recipient are excluded from fee collection. These fees are collected over the course of a period of time and can be distributed to a specific account by the owner of the contract, unless the recipient is excluded from rewards. Once distributed, a 2% tax is collected by the owner of the contract to offset gas costs. Both the tax and initial transfer fee can be updated by the owner of the contract.

Because we want to implement a lottery system, we need to devise of a way of randomly selecting an account. Due to the expensive (computationally and monetarily) nature of selecting a random account inside the blockchain, this selection process will be automated off-chain.

### Contribution

Created by Andrew Perera

Fork of the REFLECT contract (https://github.com/reflectfinance/reflect-contracts)
\
Concepts referenced from SAFEMOON (https://github.com/safemoonprotocol/Safemoon.sol)

_All modifications are reflected in the comments of the Ecstasy contract._
