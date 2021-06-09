# Contracts

## Ecstasy

Based on RFI, Ecstasy takes a transaction fee from each transfer. 1% will be immediately distributed to other holders of the token and 2% will be added to a "pot" that will be transferred to one lucky winner at the end of each week. The logic behind the pot is very similar to the way SAFEMOON extracts liquidity, however, we will distribute the collected fees directly to lottery winners.

### Transaction Fees

**Default fee: 1%**

Transaction fees are taken from each transfer unless either the sender or recipient are excluded from fee collection. These fees will be automatically reflected in each holders balance, unless they are excluded from rewards. Accounts with larger balances will see a greater reward from this process. The default fee of 2% can be changed by the owner of the contract at any point.

### Lottery Fees

**Default fee: 2%**

Lottery fees are also taken from each transfer unless the sender or recipient are excluded from fees. These fees are collected over the course of a period of time and can be distributed through a lottery system by any token holder, unless the distributor is excluded from rewards.

The lottery system works by generating a random number off-chain, using the Provable oracle, and using that number to select a token holder's address. Once distributed, a 2% tax is taken from the reward and sent to the distributor to offset gas costs. Both the tax and initial transfer fee can be updated by the owner of the contract.

### Contribution

Created by Andrew Perera

Fork of the REFLECT contract (https://github.com/reflectfinance/reflect-contracts)
\
Concepts referenced from SAFEMOON (https://github.com/safemoonprotocol/Safemoon.sol)

_All modifications are reflected in the comments of the Ecstasy contract._
