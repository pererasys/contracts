const Ecstasy = artifacts.require("Ecstasy");
const Lottery = artifacts.require("Lottery");

// helpers

const waitForEvent = (_event, _from = 0, _to = "latest") =>
  new Promise((resolve, reject) =>
    _event({ fromBlock: _from, toBlock: _to }, (e, ev) =>
      e ? reject(e) : resolve(ev)
    )
  );

contract("Ecstasy", (accounts) => {
  const TOTAL_SUPPLY = 1 * 10 ** 9 * 10 ** 9;

  const DEFAULT_TRANSFER_FEE = 1;
  const DEFAULT_LOTTERY_FEE = 2;

  const DEFAULT_LOTTERY_TAX = 2;

  const setup = async () => {
    const lottery = await Lottery.new();
    const ecstasy = await Ecstasy.new(lottery.address);

    return { lottery, ecstasy };
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

    await contract.transfer(to.address, amount, { from: from.address });

    const finalBalanceFrom = await contract.balanceOf(from.address);
    const finalBalanceTo = await contract.balanceOf(to.address);

    const expectedTransferFee = (amount * transferFee) / 10 ** 2;
    const expectedLotteryFee = (amount * lotteryFee) / 10 ** 2;
    const expectedTotalFees = expectedTransferFee + expectedLotteryFee;

    // ensure the supply hasn't changed after transfer
    assert.equal(await contract.totalSupply(), TOTAL_SUPPLY, "Supply mismatch");

    return {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
      expectedTransferFee,
      expectedLotteryFee,
      expectedTotalFees,
    };
  };

  it("should have correct decimals", async () => {
    const { ecstasy } = await setup();
    const decimals = await ecstasy.decimals();

    assert.equal(decimals, 9, "Decimals mismatch");
  });

  it("should have correct total supply", async () => {
    const { ecstasy } = await setup();
    const supply = await ecstasy.totalSupply();

    assert.equal(supply, TOTAL_SUPPLY, "Supply mismatch");
  });

  it("owner should have total supply at deployment", async () => {
    const { ecstasy } = await setup();
    const balance = await ecstasy.balanceOf(accounts[0]);

    assert.equal(balance, TOTAL_SUPPLY, "Balance mismatch");
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

    assert.equal(pot, 0, "Pot mismatch");
  });

  it("lottery should be excluded from rewards by default", async () => {
    const { ecstasy, lottery } = await setup();
    const status = await ecstasy.isExcluded(lottery.address);

    assert.equal(status, true, "Lottery exclusion status mismatch");
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
    const amount = 1000;

    const {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
    } = await testTransfer({ contract: ecstasy, from, to, amount });

    assert.equal(
      finalBalanceFrom,
      parseInt(initialBalanceFrom) - parseInt(amount),
      "FROM balance mismatch"
    );
    assert.equal(
      finalBalanceTo,
      parseInt(initialBalanceTo) + parseInt(amount),
      "TO balance mismatch"
    );
    assert.equal(
      await ecstasy.balanceOf(lottery.address),
      0,
      "Lottery pot mismatch"
    );
    assert.equal(await ecstasy.totalFees(), 0, "Total fees mismatch");
  });

  it("should transfer without fees - to excluded", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1], excluded: true };
    const amount = 1000;

    const {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
    } = await testTransfer({ contract: ecstasy, from, to, amount });

    assert.equal(
      finalBalanceFrom,
      parseInt(initialBalanceFrom) - parseInt(amount),
      "FROM balance mismatch"
    );
    assert.equal(
      finalBalanceTo,
      parseInt(initialBalanceTo) + parseInt(amount),
      "TO balance mismatch"
    );
    assert.equal(
      await ecstasy.balanceOf(lottery.address),
      0,
      "Lottery pot mismatch"
    );
    assert.equal(await ecstasy.totalFees(), 0, "Total fees mismatch");
  });

  it("should transfer without fees - both excluded", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0], excluded: true };
    const to = { address: accounts[1], excluded: true };
    const amount = 1000;

    const {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
    } = await testTransfer({ contract: ecstasy, from, to, amount });

    assert.equal(
      finalBalanceFrom,
      parseInt(initialBalanceFrom) - parseInt(amount),
      "FROM balance mismatch"
    );
    assert.equal(
      finalBalanceTo,
      parseInt(initialBalanceTo) + parseInt(amount),
      "TO balance mismatch"
    );
    assert.equal(
      await ecstasy.balanceOf(lottery.address),
      0,
      "Lottery pot mismatch"
    );
    assert.equal(await ecstasy.totalFees(), 0, "Total fees mismatch");
  });

  it("should transfer with fees - both included", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1] };
    const amount = 1000;

    const {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
      expectedTotalFees,
      expectedTransferFee,
      expectedLotteryFee,
    } = await testTransfer({ contract: ecstasy, from, to, amount });

    assert.equal(
      finalBalanceFrom,
      parseInt(initialBalanceFrom) -
        parseInt(amount) +
        parseInt(expectedTotalFees),
      "FROM balance mismatch"
    );
    assert.equal(
      finalBalanceTo,
      parseInt(initialBalanceTo) +
        parseInt(amount) -
        parseInt(expectedTotalFees),
      "TO balance mismatch"
    );
    assert.equal(
      await ecstasy.balanceOf(lottery.address),
      expectedLotteryFee,
      "Lottery pot mismatch"
    );
    assert.equal(
      await ecstasy.totalFees(),
      expectedTransferFee,
      "Total fees mismatch"
    );
  });

  it("should transfer with updated fee structure", async () => {
    const { ecstasy, lottery } = await setup();

    const from = { address: accounts[0] };
    const to = { address: accounts[1] };
    const amount = 1000;

    const {
      initialBalanceFrom,
      initialBalanceTo,
      finalBalanceFrom,
      finalBalanceTo,
      expectedTotalFees,
      expectedTransferFee,
      expectedLotteryFee,
    } = await testTransfer({
      contract: ecstasy,
      from,
      to,
      amount,
      transferFee: 5,
      lotteryFee: 5,
    });

    assert.equal(
      finalBalanceFrom,
      parseInt(initialBalanceFrom) -
        parseInt(amount) +
        parseInt(expectedTotalFees),
      "FROM balance mismatch"
    );
    assert.equal(
      finalBalanceTo,
      parseInt(initialBalanceTo) +
        parseInt(amount) -
        parseInt(expectedTotalFees),
      "TO balance mismatch"
    );
    assert.equal(
      await ecstasy.balanceOf(lottery.address),
      expectedLotteryFee,
      "Lottery pot mismatch"
    );
    assert.equal(
      await ecstasy.totalFees(),
      expectedTransferFee,
      "Total fees mismatch"
    );
  });

  // TODO test lottery distribution

  it("setTransferFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.setTransferFee(3, { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("setLotteryFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.setLotteryFee(3, { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("setLotteryTax - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.setLotteryTax(3, { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("excludeFromFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.excludeFromFee(accounts[1], { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("includeInFee - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.includeInFee(accounts[1], { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("excludeAccount - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.excludeAccount(accounts[1], { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("includeAccount - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.includeAccount(accounts[1], { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("setLotteryInterval - should throw error (onlyOwner)", async () => {
    const { ecstasy } = await setup();
    const notOwner = accounts[5];

    try {
      await ecstasy.setLotteryInterval(10, false, { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("startLottery - should throw error (unavailable)", async () => {
    const { ecstasy } = await setup();

    try {
      await ecstasy.startLottery();
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Distribution is unavailable",
        "Did not throw correct error"
      );
    }
  });

  it("startLottery - should throw error (excluded)", async () => {
    const { ecstasy } = await setup();

    const from = accounts[1];

    await ecstasy.excludeAccount(from);

    // update lottery interval to avoid wrong error
    await ecstasy.setLotteryInterval(0, true);

    // wait for interval to update?
    setTimeout(async () => {
      try {
        await ecstasy.startLottery({ from });
        throw new Error("not the expected error");
      } catch (e) {
        assert.equal(
          e.reason,
          "Distributor is excluded from rewards",
          "Did not throw correct error"
        );
      }
    }, 100);
  });
});
