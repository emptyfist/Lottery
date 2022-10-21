# Lottery

Solidity Test

This is a brief test where you can show-case your skills on solidity development.

Mission Overview

Deliver the requested contract, described below, within a week. This means you have 7 days.

Mission Details

Build the following smart contract using the latest solidity version.

NFT Lottery

The NFT Lottery contract will receive a token (ERC20), mint and transfer to the msg.sender a ticket (ERC1155), sell a portion of the received ERC20 for another ERC20 (swap) and finally send the swapped funds to an address.

The NFT Lottery contract should draw a random winner from 10 ticket sales. This means that after 10 tickets are sold, one of the buyers [1-10] will randomly be rewarded with an NFT they can mint.

The contract should store the following events:

Ticket sale,

Total Tokens swapped per saleId,

Lottery winner per lotteryId.

Suggested NFT Lottery contract functions

buyTicket - holds the saleId, ticket price, total tickets, fee

ticketDetails - ticketId, address msg.sender

createLottery - LotteryId

winnerNFT - TicketIds [range]

vaultAddress - address

approvedERC20 - address
