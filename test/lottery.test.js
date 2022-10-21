const { expect } = require('chai');
const { BigNumber } = require("ethers");
const { ethers } = require('hardhat');
const { deploy } = require('../scripts/utils');
const { erc20_abi } = require('../external_abi/erc20.abi.json');
const { uniswap_abi } = require('../external_abi/uniswap.abi.json');

const bigNum = num => (num + '0'.repeat(18));
const smallNum = num => (parseInt(num) / bigNum(1));
const bigNum_6 = num => (num + '0'.repeat(6));
const smallNum_6 = num => (parseInt(num) / bigNum_6(1));

describe ("lottery testing", function () {
    let ticketPrice, swapPercent;
    let priceTokenAddr = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";      // usdc
    let swapTokenAddr = "0xdac17f958d2ee523a2206206994597c13d831ec7";       // usdt
    let uniswapRouterAddr = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";

    before (async function () {
        [
            this.owner,
            this.lotteryVault,
            this.buyer_1,            
            this.buyer_2,            
            this.buyer_3,            
            this.buyer_4,            
            this.buyer_5
        ] = await ethers.getSigners();

        this.usdc = new ethers.Contract(priceTokenAddr, erc20_abi, this.owner);
        this.usdt = new ethers.Contract(swapTokenAddr, erc20_abi, this.owner);
        this.uniswapRouter = new ethers.Contract(uniswapRouterAddr, uniswap_abi, this.owner);

        this.rewardNFT = await deploy(
            "RewardNFT",
            "RewardNFT",
            "RewardNFT",
            "RWNT"
        );

        this.ticketNFT = await deploy(
            "TicketNFT",
            "TicketNFT",
            "Ticket",
            "TNT"
        );

        ticketPrice = bigNum_6(1000);
        swapPercent = 10;   // 10%
        this.lottery = await deploy(
            "Lottery",
            "Lottery",
            BigInt(ticketPrice),
            swapPercent,
            this.ticketNFT.address,
            priceTokenAddr,
            swapTokenAddr,
            this.rewardNFT.address,
            this.lotteryVault.address,
            uniswapRouterAddr
        );
    })

    it ("swap ETH to USDC", async function () {
        const beforeUSDCBal = await this.usdc.balanceOf(this.owner.address);

        const ethAmount = bigNum(300);
        const ethAddress = await this.uniswapRouter.WETH();

        const amounts = await this.uniswapRouter.getAmountsOut(
            ethAmount,
            [
                ethAddress,
                priceTokenAddr
            ]
        );
        const expectUSDCAmount = amounts[1];

        await this.uniswapRouter.swapExactETHForTokens(
            0,
            [
                ethAddress,
                priceTokenAddr
            ],
            this.owner.address,
            parseInt(new Date().getTime() / 1000) + 100,
            { value: ethAmount }
        );
        const afterUSDCBal = await this.usdc.balanceOf(this.owner.address);
        const swappedUSDCBal = BigInt(afterUSDCBal) - BigInt(beforeUSDCBal);
        expect(smallNum(swappedUSDCBal)).to.equal(smallNum(expectUSDCAmount));
    })

    it ("reverts if users try to buy more than max count or don't have enough money", async function () {
        let ticketAmount = 2;
        let price = BigInt(ticketPrice) * BigInt(ticketAmount);
        await this.usdc.connect(this.buyer_1).approve(this.lottery.address, BigInt(price));
        // revert if buyer have not enough money.
        await expect (
            this.lottery.connect(this.buyer_1).buyTicket(
                ticketAmount
            )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

        let transferAmount = BigInt(await this.usdc.balanceOf(this.owner.address)) / BigInt(6);
        await this.usdc.transfer(this.buyer_1.address, BigInt(transferAmount));
        await this.usdc.transfer(this.buyer_2.address, BigInt(transferAmount));
        await this.usdc.transfer(this.buyer_3.address, BigInt(transferAmount));
        await this.usdc.transfer(this.buyer_4.address, BigInt(transferAmount));
        await this.usdc.transfer(this.buyer_5.address, BigInt(transferAmount));

        // revert if buyer try to buy over max count
        let maxBuyTicketCnt = await this.lottery.maxBuyTicketCnt();
        price = BigInt(ticketPrice) * BigInt(maxBuyTicketCnt + 1);
        await this.usdc.connect(this.buyer_1).approve(this.lottery.address, BigInt(price));
        await expect (
            this.lottery.buyTicket(maxBuyTicketCnt + 1)
        ).to.be.revertedWith("exceeds max amount");
    })

    it ("buy lottery tickets", async function () {
        let ticketAmount = 2;
        this.totalTickets = ticketAmount;
        let price = BigInt(ticketPrice) * BigInt(ticketAmount);
        let lotterId = await this.lottery.lotteryId();
        let swapAmount = BigInt(price) * BigInt(swapPercent) / BigInt(100);

        const amounts = await this.uniswapRouter.getAmountsOut(
            swapAmount,
            [
                this.usdc.address,
                this.usdt.address
            ]
        );
        let expectPriceForVault = amounts[1];

        let beforeTicketAmount = await this.ticketNFT.balanceOf(this.buyer_1.address, lotterId);
        let beforeSwapTokenAmount = await this.usdt.balanceOf(this.lotteryVault.address);

        await this.usdc.connect(this.buyer_1).approve(this.lottery.address, BigInt(price));
        let tx = await this.lottery.connect(this.buyer_1).buyTicket(ticketAmount);

        let receipt = await tx.wait();
        let events = receipt.events?.filter((x) => { return x.event == "TicketSale" });
        expect (events[0].args.saleId).to.be.equal(1);
        expect(BigInt(events[0].args.ticketPrice)).to.be.equal(BigInt(price));
        expect (events[0].args.totalTickets).to.be.equal(this.totalTickets);

        events = receipt.events?.filter((x) => { return x.event == "SwappedPriceTokens" });
        expect (events[0].args.saleId).to.be.equal(1);
        expect(events[0].args.swappedAmount).to.be.equal(BigInt(swapAmount));

        let afterTicketAmount = await this.ticketNFT.balanceOf(this.buyer_1.address, lotterId);
        let afterSwapTokenAmount = await this.usdt.balanceOf(this.lotteryVault.address);

        let getTicketAmount = afterTicketAmount - beforeTicketAmount;
        expect (getTicketAmount).to.be.closeTo(ticketAmount, 0.1);

        let amountForVault = afterSwapTokenAmount - beforeSwapTokenAmount;
        expect(Number(amountForVault)).to.be.closeTo(Number(expectPriceForVault), 0.1);
    })

    it ("change maxBuyCnt, buy max count and check winner's wallet", async function () {
        await expect (
            this.lottery.connect(this.buyer_1).modifyMaxBuyTicketCnt(6)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await this.lottery.modifyMaxBuyTicketCnt(6);
        const maxCnt = await this.lottery.maxBuyTicketCnt();
        expect (maxCnt).to.be.equal(6);

        let ticketAmount = 6;
        let ticketPrice = await this.lottery.ticketPrice();
        this.totalTickets += ticketAmount;
        let price = BigInt(ticketPrice) * BigInt(ticketAmount);
        await this.usdc.connect(this.buyer_2).approve(this.lottery.address, BigInt(price));
        await expect (
            this.lottery.connect(this.buyer_2).buyTicket(ticketAmount)
        ).to.be.emit(this.lottery, "TicketSale")
        .withArgs(
            2,
            BigInt(price),
            this.totalTickets
        );

        ticketPrice = await this.lottery.ticketPrice();
        price = BigInt(ticketPrice) * BigInt(ticketAmount);
        await this.usdc.connect(this.buyer_3).approve(this.lottery.address, BigInt(price));

        await expect(
            this.lottery.connect(this.buyer_3).buyTicket(ticketAmount)
        ).to.be.revertedWith("exceeds max amount");

        // buy left tickets and check that new lottery is started.
        const beforeLotteryId = await this.lottery.lotteryId();
        ticketAmount = await this.lottery.leftTicketCnt();
        price = BigInt(ticketPrice) * BigInt(ticketAmount);
        await this.usdc.connect(this.buyer_3).approve(this.lottery.address, BigInt(price));

        let tx = await this.lottery.connect(this.buyer_3).buyTicket(ticketAmount);
        const afterLotteryId = await this.lottery.lotteryId();
        const winner = await this.lottery.getWinner(afterLotteryId - 1);
        let receipt = await tx.wait();
        let events = receipt.events?.filter((x) => { return x.event == "CreatedLottery" });
        expect(events[0].args.lotteryId).to.be.equal(afterLotteryId);
        events = receipt.events?.filter((x) => { return x.event == "WinnerForLottery" });
        expect(events[0].args.winner).to.be.equal(winner);
        expect(events[0].args.lotteryId).to.be.equal(beforeLotteryId);
        
        const rewardNFTBal = await this.rewardNFT.balanceOf(winner);

        expect (afterLotteryId - beforeLotteryId).to.be.equal(1);
        expect(rewardNFTBal).to.be.equal(1);
    })
})