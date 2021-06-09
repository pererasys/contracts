const Ecstasy = artifacts.require("Ecstasy");
const Lottery = artifacts.require("Lottery");

const setup = async () => {
  const lottery = await Lottery.new();
  const ecstasy = await Ecstasy.new(lottery.address);

  return { lottery, ecstasy };
};

contract("Ecstasy", (accounts) => {
  const DEFAULT_SUPPLY = 1 * 10 ** 9 * 10 ** 9;

  const DEFAULT_TRANSFER_FEE = 1;
  const DEFAULT_LOTTERY_FEE = 2;

  const DEFAULT_LOTTERY_TAX = 2;

  it("should have correct decimals", async () => {
    const { ecstasy } = await setup();
    const decimals = await ecstasy.decimals();

    assert.equal(decimals, 9, "Decimals mismatch");
  });

  it("should have correct total supply", async () => {
    const { ecstasy } = await setup();
    const supply = await ecstasy.totalSupply();

    assert.equal(supply, DEFAULT_SUPPLY, "Supply mismatch");
  });

  it("owner should have total supply at deployment", async () => {
    const { ecstasy } = await setup();
    const balance = await ecstasy.balanceOf(accounts[0]);

    assert.equal(balance, DEFAULT_SUPPLY, "Balance mismatch");
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

  it("should transfer without fees", async () => {
    const { ecstasy, lottery } = await setup();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await ecstasy.balanceOf(from);

    // ensure at least one party is excluded in fees
    await ecstasy.excludeFromFee(from);

    const transferAmount = 100;
    await ecstasy.transfer(to, transferAmount, { from });

    const balanceFrom = await ecstasy.balanceOf(from);
    const balanceTo = await ecstasy.balanceOf(to);

    const fees = await ecstasy.totalFees();
    const pot = await ecstasy.balanceOf(lottery.address);

    assert.equal(
      balanceFrom,
      initialBalanceFrom - transferAmount,
      "FROM balance mismatch"
    );
    assert.equal(balanceTo, transferAmount, "TO balance mismatch");
    assert.equal(fees, 0, "Fee mismatch");
    assert.equal(pot, 0, "Pot mismatch");
  });

  it("should transfer with fees", async () => {
    const { ecstasy, lottery } = await setup();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await ecstasy.balanceOf(from);

    // ensure both parties are included in fees
    await ecstasy.includeInFee(from);
    await ecstasy.includeInFee(to);

    const transferAmount = 100;
    await ecstasy.transfer(to, transferAmount, { from });

    const balanceFrom = await ecstasy.balanceOf(from);
    const balanceTo = await ecstasy.balanceOf(to);

    const transferFees = await ecstasy.totalFees();
    const currentPot = await ecstasy.balanceOf(lottery.address);

    const expectedFees = (transferAmount * DEFAULT_TRANSFER_FEE) / 10 ** 2;
    const expectedPot = (transferAmount * DEFAULT_LOTTERY_FEE) / 10 ** 2;
    const expectedTotalFees = expectedFees + expectedPot;

    // IMPORTANT: ensure the total supply has not changed
    const totalSupply = await ecstasy.totalSupply();
    const expectedSupply = parseInt(balanceFrom) + parseInt(balanceTo);
    assert.equal(totalSupply, expectedSupply, "Supply mismatch");

    assert.equal(
      balanceFrom,
      initialBalanceFrom - transferAmount,
      "FROM balance mismatch"
    );
    assert.equal(
      balanceTo,
      transferAmount - expectedTotalFees,
      "TO balance mismatch"
    );
    assert.equal(transferFees, expectedFees, "Fee mismatch");
    assert.equal(currentPot, expectedPot, "Pot mismatch");
  });

  it("should transfer with updated fee structure", async () => {
    const { ecstasy, lottery } = await setup();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await ecstasy.balanceOf(from);

    const transferAmount = 100;
    const newTransactionFee = DEFAULT_TRANSFER_FEE + 3;
    const newLotteryFee = DEFAULT_LOTTERY_FEE + 2;

    await ecstasy.setTransferFee(newTransactionFee);
    await ecstasy.setLotteryFee(newLotteryFee);

    // ensure both parties are included in fees
    await ecstasy.includeInFee(from);
    await ecstasy.includeInFee(to);

    await ecstasy.transfer(to, transferAmount, { from });

    const balanceFrom = await ecstasy.balanceOf(from);
    const balanceTo = await ecstasy.balanceOf(to);

    const transferFees = await ecstasy.totalFees();
    const currentPot = await ecstasy.balanceOf(lottery.address);

    const expectedFees = (transferAmount * newTransactionFee) / 10 ** 2;
    const expectedPot = (transferAmount * newLotteryFee) / 10 ** 2;
    const expectedTotalFees = expectedFees + expectedPot;

    assert.equal(
      balanceFrom,
      initialBalanceFrom - transferAmount,
      "FROM balance mismatch"
    );
    assert.equal(
      balanceTo,
      transferAmount - expectedTotalFees,
      "TO balance mismatch"
    );
    assert.equal(transferFees, expectedFees, "Fee mismatch");
    assert.equal(currentPot, expectedPot, "Pot mismatch");
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
    const { ecstasy, lottery } = await setup();

    await ecstasy.excludeAccount(accounts[1]);

    // update lottery interval to avoid wrong error
    await ecstasy.setLotteryInterval(0, true);

    try {
      await ecstasy.startLottery({ from: accounts[1] });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Distributor is excluded from rewards",
        "Did not throw correct error"
      );
    }
  });
});
