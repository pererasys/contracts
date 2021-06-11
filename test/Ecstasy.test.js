const Web3 = require("web3");
const {
  BN,
  time,
  expectRevert,
  expectEvent,
} = require("@openzeppelin/test-helpers");

const Ecstasy = artifacts.require("Ecstasy");
const Lottery = artifacts.require("Lottery");

const web3Sockets = new Web3(
  new Web3.providers.WebsocketProvider("ws://localhost:9545")
);

// helpers

const waitForEvent = (_event, _from = 0, _to = "latest") =>
  new Promise((resolve, reject) =>
    _event({ fromBlock: _from, toBlock: _to }, (e, ev) =>
      e ? reject(e) : resolve(ev)
    )
  );

const toPercent = (n) => n.div(new BN((10 ** 2).toString()));

contract("Ecstasy", (accounts) => {
  const DECIMALS = new BN("9");
  const TOTAL_SUPPLY = new BN((1 * 10 ** 9 * 10 ** 9).toString());

  const DEFAULT_TRANSFER_FEE = new BN("1");
  const DEFAULT_LOTTERY_FEE = new BN("2");

  const DEFAULT_LOTTERY_TAX = new BN("2");

  const setup = async () => {
    const lottery = await Lottery.new();
    const ecstasy = await Ecstasy.new(lottery.address);

    const { methods: ecstasyMethods, events: ecstasyEvents } =
      new web3Sockets.eth.Contract(
        ecstasy.contract._jsonInterface,
        ecstasy.contract._address
      );
    const { methods: lotteryMethods, events: lotteryEvents } =
      new web3Sockets.eth.Contract(
        lottery.contract._jsonInterface,
        lottery.contract._address
      );

    return {
      lottery,
      ecstasy,
      ecstasyEvents,
      ecstasyMethods,
      lotteryEvents,
      lotteryMethods,
    };
  };

  const testTransfer = async ({
    contract,
    from,
    to,
    amount,
    transferFee = DEFAULT_TRANSFER_FEE,
    lotteryFee = DEFAULT_LOTTERY_FEE,
  }) => {
    const initialBalanceFrom = await contract.balanceOf(from.address);
    const initialBalanceTo = await contract.balanceOf(to.address);

    if (transferFee !== DEFAULT_TRANSFER_FEE)
      await contract.setTransferFee(transferFee);
    if (lotteryFee !== DEFAULT_LOTTERY_FEE)
      await contract.setLotteryFee(lotteryFee);

    if (from.excluded) await contract.excludeFromFee(from.address);
    else await contract.includeInFee(from.address);

    if (to.excluded) await contract.excludeFromFee(to.address);
    else await contract.includeInFee(to.address);

    const receipt = await contract.transfer(to.address, amount, {
      from: from.address,
    });

    const finalBalanceFrom = await contract.balanceOf(from.address);
    const finalBalanceTo = await contract.balanceOf(to.address);

    const expectedTransferFee = toPercent(amount.mul(transferFee));
    const expectedLotteryFee = toPercent(amount.mul(lotteryFee));
    const expectedTotalFees = expectedTransferFee.add(expectedLotteryFee);

    // ensure the supply hasn't changed after transfer
    assert((await contract.totalSupply()).eq(TOTAL_SUPPLY), "Supply mismatch");

    return {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
      expectedTransferFee,
      expectedLotteryFee,
      expectedTotalFees,
      receipt,
    };
  };

  it("should have correct decimals", async () => {
    const { ecstasy } = await setup();
    const decimals = await ecstasy.decimals();

    assert(decimals.eq(DECIMALS), "Decimals mismatch");
  });

  it("should have correct total supply", async () => {
    const { ecstasy } = await setup();
    const supply = await ecstasy.totalSupply();

    assert(supply.eq(TOTAL_SUPPLY), "Supply mismatch");
  });

  it("owner should have total supply at deployment", async () => {
    const { ecstasy } = await setup();
    const balance = await ecstasy.balanceOf(accounts[0]);

    assert(balance.eq(TOTAL_SUPPLY), "Balance mismatch");
  });

  it("owner should be excluded from fees by default", async () => {
    const { ecstasy } = await setup();
    const feeStatus = await ecstasy.isExcludedFromFee(accounts[0]);

    assert.equal(feeStatus, true, "Owner fee status mismatch");
  });

  it("lottery should be excluded from fees by default", async () => {
    const { ecstasy, lottery } = await setup();
    const feeStatus = await ecstasy.isExcludedFromFee(lottery.address);

    assert.equal(feeStatus, true, "Lottery fee status mismatch");
  });

  it("pot should be empty", async () => {
    const { ecstasy, lottery } = await setup();
    const pot = await ecstasy.balanceOf(lottery.address);

    assert(pot.eq(new BN("0")), "Pot mismatch");
  });

  it("lottery should be excluded from rewards by default", async () => {
    const { ecstasy, lottery } = await setup();
    const status = await ecstasy.isExcluded(lottery.address);

    assert(status, true, "Lottery exclusion status mismatch");
  });

  it("should have correct lottery address", async () => {
    const { ecstasy, lottery } = await setup();

    assert.equal(
      await ecstasy.lottery(),
      lottery.address,
      "Lottery address mismatch"
    );
  });

  it("should exclude account from rewards", async () => {
    const { ecstasy } = await setup();

    const account = accounts[1];

    const initialStatus = await ecstasy.isExcluded(account);

    assert.equal(initialStatus, false, "Account initial status mismatch");

    await ecstasy.excludeAccount(account);

    const finalStatus = await ecstasy.isExcluded(account);

    assert.equal(finalStatus, true, "Account final status mismatch");
  });

  it("should include account in rewards", async () => {
    const { ecstasy } = await setup();

    const account = accounts[1];

    await ecstasy.excludeAccount(account);
    const initialStatus = await ecstasy.isExcluded(account);

    assert.equal(initialStatus, true, "Account initial status mismatch");

    await ecstasy.includeAccount(account);
    const finalStatus = await ecstasy.isExcluded(account);

    assert.equal(finalStatus, false, "Account final status mismatch");
  });

  it("should exclude account from fees", async () => {
    const { ecstasy } = await setup();

    const account = accounts[1];

    await ecstasy.includeInFee(account);
    const initialStatus = await ecstasy.isExcludedFromFee(account);

    assert.equal(initialStatus, false, "Account initial status mismatch");

    await ecstasy.excludeFromFee(account);
    const finalStatus = await ecstasy.isExcludedFromFee(account);

    assert.equal(finalStatus, true, "Account final status mismatch");
  });

  it("should include account in fees", async () => {
    const account = accounts[1];

    const { ecstasy } = await setup();

    await ecstasy.excludeFromFee(account);
    const initialStatus = await ecstasy.isExcludedFromFee(account);

    assert.equal(initialStatus, true, "Account initial status mismatch");

    await ecstasy.includeInFee(account);
    const finalStatus = await ecstasy.isExcludedFromFee(account);

    assert.equal(finalStatus, false, "Account final status mismatch");
  });

  it("should transfer without fees - from excluded", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0], excluded: true };
    const to = { address: accounts[1] };
    const amount = new BN("1000");

    const { receipt } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
    });

    expectEvent(receipt, "Transfer", {
      from: from.address,
      to: to.address,
      value: amount,
    });

    assert(
      (await ecstasy.balanceOf(lottery.address)).eq(new BN("0")),
      "Lottery pot mismatch"
    );
    assert((await ecstasy.totalFees()).eq(new BN("0")), "Total fees mismatch");
  });

  it("should transfer without fees - to excluded", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1], excluded: true };
    const amount = new BN("1000");

    const { receipt } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
    });

    expectEvent(receipt, "Transfer", {
      from: from.address,
      to: to.address,
      value: amount,
    });

    assert(
      (await ecstasy.balanceOf(lottery.address)).eq(new BN("0")),
      "Lottery pot mismatch"
    );
    assert((await ecstasy.totalFees()).eq(new BN("0")), "Total fees mismatch");
  });

  it("should transfer without fees - both excluded", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0], excluded: true };
    const to = { address: accounts[1], excluded: true };
    const amount = new BN("1000");

    const { receipt } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
    });

    expectEvent(receipt, "Transfer", {
      from: from.address,
      to: to.address,
      value: amount,
    });

    assert(
      (await ecstasy.balanceOf(lottery.address)).eq(new BN("0")),
      "Lottery pot mismatch"
    );
    assert((await ecstasy.totalFees()).eq(new BN("0")), "Total fees mismatch");
  });

  it("should transfer with fees - both included", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1] };
    const amount = new BN("1000");

    const {
      expectedTransferFee,
      expectedLotteryFee,
      expectedTotalFees,
      receipt,
    } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
    });

    expectEvent(receipt, "Transfer", {
      from: from.address,
      to: to.address,
      value: amount.sub(expectedTotalFees),
    });

    assert(
      (await ecstasy.balanceOf(lottery.address)).eq(expectedLotteryFee),
      "Lottery pot mismatch"
    );
    assert(
      (await ecstasy.totalFees()).eq(expectedTransferFee),
      "Total fees mismatch"
    );
  });

  it("should transfer with updated fee structure", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1] };
    const amount = new BN("1000");
    const transferFee = new BN("5");
    const lotteryFee = new BN("5");

    const {
      expectedTotalFees,
      expectedTransferFee,
      expectedLotteryFee,
      receipt,
    } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
      transferFee,
      lotteryFee,
    });

    expectEvent(receipt, "Transfer", {
      from: from.address,
      to: to.address,
      value: amount.sub(expectedTotalFees),
    });

    assert(
      (await ecstasy.balanceOf(lottery.address)).eq(expectedLotteryFee),
      "Lottery pot mismatch"
    );
    assert(
      (await ecstasy.totalFees()).eq(expectedTransferFee),
      "Total fees mismatch"
    );
  });

  it("should start the lottery", async () => {
    const { ecstasy, lottery, ecstasyEvents, lotteryEvents } = await setup();

    await testTransfer({
      contract: ecstasy,
      from: { address: accounts[0] },
      to: { address: accounts[1] },
      amount: new BN("1000000"),
    });

    const distributor = accounts[1];

    await time.increaseTo(
      (await ecstasy.nextLottery()).add(time.duration.seconds(1))
    );

    const totalPot = await ecstasy.balanceOf(lottery.address);
    const expectedTax = toPercent(totalPot.mul(DEFAULT_LOTTERY_TAX));
    const expectedReward = totalPot - expectedTax;

    await ecstasy.startLottery({ from: distributor });

    const {
      returnValues: { distributor: loggedDistributor },
    } = await waitForEvent(lotteryEvents["StartLottery"]);

    assert.equal(
      loggedDistributor,
      distributor,
      "Distributor mismatch in event"
    );

    const {
      returnValues: { amount: reward },
    } = await waitForEvent(ecstasyEvents["TransferLotteryReward"]);

    assert(reward.eq(expectedReward), "Reward mismatch");

    const {
      returnValues: { to: taxRecipient, amount: tax },
    } = await waitForEvent(ecstasyEvents["TransferLotteryTax"]);

    assert(tax.eq(expectedTax), "Tax mismatch");
    assert.equal(taxRecipient, distributor, "Tax recipient mismatch");
  });

  it("setTransferFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.setTransferFee(3, { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("setLotteryFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.setLotteryFee(3, { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("setLotteryTax - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.setLotteryTax(3, { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("excludeFromFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.excludeFromFee(accounts[1], { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("includeInFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.includeInFee(accounts[1], { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("excludeAccount - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();

    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.excludeAccount(accounts[1], { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("includeAccount - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.includeAccount(accounts[1], { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("setLotteryInterval - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    await expectRevert(
      ecstasy.setLotteryInterval(10, false, { from: notOwner }),
      "Ownable: caller is not the owner"
    );
  });

  it("startLottery - should throw error (unavailable)", async () => {
    const { ecstasy } = await setup();

    await expectRevert(ecstasy.startLottery(), "Distribution is unavailable");
  });

  it("startLottery - should throw error (excluded)", async () => {
    const { ecstasy } = await setup();

    const from = accounts[1];
    await ecstasy.excludeAccount(from);

    await time.increaseTo(
      (await ecstasy.nextLottery()).add(time.duration.seconds(1))
    );

    await expectRevert(
      ecstasy.startLottery({ from }),
      "Distributor is excluded from rewards"
    );
  });
});
