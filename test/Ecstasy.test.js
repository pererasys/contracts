const Ecstasy = artifacts.require("Ecstasy");

const DEFAULT_SUPPLY = 100 * 10 ** 6 * 10 ** 9;

const DEFAULT_TRANSFER_FEE = 1;
const DEFAULT_LOTTERY_FEE = 2;

const DEFAULT_LOTTERY_TAX = 2;

contract("Ecstasy", (accounts) => {
  it("should have correct decimals", async () => {
    const instance = await Ecstasy.new();
    const decimals = await instance.decimals();

    assert.equal(decimals, 9, "Decimals mismatch");
  });

  it("should have correct total supply", async () => {
    const instance = await Ecstasy.new();
    const supply = await instance.totalSupply();

    assert.equal(supply, DEFAULT_SUPPLY, "Supply mismatch");
  });

  it("owner should have total supply at deployment", async () => {
    const instance = await Ecstasy.new();
    const balance = await instance.balanceOf(accounts[0]);

    assert.equal(balance, DEFAULT_SUPPLY, "Balance mismatch");
  });

  it("owner should be excluded from fees by default", async () => {
    const instance = await Ecstasy.new();
    const feeStatus = await instance.isExcludedFromFee(accounts[0]);

    assert.equal(feeStatus, true, "Owner fee status mismatch");
  });

  it("pot should be excluded from fees by default", async () => {
    const instance = await Ecstasy.new();
    const feeStatus = await instance.isExcludedFromFee(instance.address);

    assert.equal(feeStatus, true, "Pot fee status mismatch");
  });

  it("pot should be empty", async () => {
    const instance = await Ecstasy.new();
    const pot = await instance.currentPot();

    assert.equal(pot, 0, "Pot mismatch");
  });

  it("pot should be excluded from rewards by default", async () => {
    const instance = await Ecstasy.new();
    const status = await instance.isExcluded(instance.address);

    assert.equal(status, true, "Pot exclusion status mismatch");
  });

  it("should exclude account from rewards", async () => {
    const instance = await Ecstasy.new();

    const account = accounts[1];

    const initialStatus = await instance.isExcluded(account);

    assert.equal(initialStatus, false, "Account initial status mismatch");

    await instance.excludeAccount(account);

    const finalStatus = await instance.isExcluded(account);

    assert.equal(finalStatus, true, "Account final status mismatch");
  });

  it("should include account in rewards", async () => {
    const instance = await Ecstasy.new();

    const account = accounts[1];

    await instance.excludeAccount(account);
    const initialStatus = await instance.isExcluded(account);

    assert.equal(initialStatus, true, "Account initial status mismatch");

    await instance.includeAccount(account);
    const finalStatus = await instance.isExcluded(account);

    assert.equal(finalStatus, false, "Account final status mismatch");
  });

  it("should exclude account from fees", async () => {
    const instance = await Ecstasy.new();

    const account = accounts[1];

    await instance.includeInFee(account);
    const initialStatus = await instance.isExcludedFromFee(account);

    assert.equal(initialStatus, false, "Account initial status mismatch");

    await instance.excludeFromFee(account);
    const finalStatus = await instance.isExcludedFromFee(account);

    assert.equal(finalStatus, true, "Account final status mismatch");
  });

  it("should include account in fees", async () => {
    const account = accounts[1];

    const instance = await Ecstasy.new();

    await instance.excludeFromFee(account);
    const initialStatus = await instance.isExcludedFromFee(account);

    assert.equal(initialStatus, true, "Account initial status mismatch");

    await instance.includeInFee(account);
    const finalStatus = await instance.isExcludedFromFee(account);

    assert.equal(finalStatus, false, "Account final status mismatch");
  });

  it("should transfer without fees", async () => {
    const instance = await Ecstasy.new();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await instance.balanceOf(from);

    // ensure at least one party is excluded in fees
    await instance.excludeFromFee(from);

    const transferAmount = 100;
    await instance.transfer(to, transferAmount, { from });

    const balanceFrom = await instance.balanceOf(from);
    const balanceTo = await instance.balanceOf(to);

    const fees = await instance.totalFees();
    const pot = await instance.currentPot();

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
    const instance = await Ecstasy.new();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await instance.balanceOf(from);

    // ensure both parties are included in fees
    await instance.includeInFee(from);
    await instance.includeInFee(to);

    const transferAmount = 100;
    await instance.transfer(to, transferAmount, { from });

    const balanceFrom = await instance.balanceOf(from);
    const balanceTo = await instance.balanceOf(to);

    const transferFees = await instance.totalFees();
    const currentPot = await instance.currentPot();

    const expectedFees = (transferAmount * DEFAULT_TRANSFER_FEE) / 10 ** 2;
    const expectedPot = (transferAmount * DEFAULT_LOTTERY_FEE) / 10 ** 2;
    const expectedTotalFees = expectedFees + expectedPot;

    // IMPORTANT: ensure the total supply has not changed
    const totalSupply = await instance.totalSupply();
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
    const instance = await Ecstasy.new();

    const from = accounts[0];
    const to = accounts[1];

    const initialBalanceFrom = await instance.balanceOf(from);

    const transferAmount = 100;
    const newTransactionFee = DEFAULT_TRANSFER_FEE + 3;
    const newLotteryFee = DEFAULT_LOTTERY_FEE + 2;

    await instance.setTransactionFee(newTransactionFee);
    await instance.setLotteryFee(newLotteryFee);

    // ensure both parties are included in fees
    await instance.includeInFee(from);
    await instance.includeInFee(to);

    await instance.transfer(to, transferAmount, { from });

    const balanceFrom = await instance.balanceOf(from);
    const balanceTo = await instance.balanceOf(to);

    const transferFees = await instance.totalFees();
    const currentPot = await instance.currentPot();

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

  it("should distribute pot appropriately", async () => {
    const instance = await Ecstasy.new();

    const owner = await instance.owner();
    const recipient = accounts[2];

    const from = accounts[0];
    const to = accounts[1];

    // ensure both parties are included in fees
    await instance.includeInFee(from);
    await instance.includeInFee(to);

    const transferAmount = 100000;
    await instance.transfer(to, transferAmount, { from });

    const initialOwnerBalance = await instance.balanceOf(owner);
    const initialRecipientBalance = await instance.balanceOf(recipient);

    const currentPot = await instance.currentPot();

    // update lottery interval to avoid error
    await instance.setLotteryInterval(0, true);

    await instance.distribute(recipient);

    const ownerBalance = await instance.balanceOf(owner);
    const toBalance = await instance.balanceOf(to);
    const recipientBalance = await instance.balanceOf(recipient);

    const expectedOwnerTax = (currentPot * DEFAULT_LOTTERY_TAX) / 10 ** 2;
    const expectedReward = currentPot - expectedOwnerTax;

    const expectedRecipientBalance =
      parseInt(initialRecipientBalance) + parseInt(expectedReward);
    const expectedOwnerBalance =
      parseInt(initialOwnerBalance) + parseInt(expectedOwnerTax);

    // IMPORTANT: ensure the total supply has not changed
    const totalSupply = await instance.totalSupply();
    const expectedSupply =
      parseInt(ownerBalance) + parseInt(toBalance) + parseInt(recipientBalance);
    assert.equal(totalSupply, expectedSupply, "Supply mismatch");

    assert.equal(
      recipientBalance,
      expectedRecipientBalance,
      "RECIPIENT balance mismatch"
    );
    assert.equal(ownerBalance, expectedOwnerBalance, "OWNER balance mismatch");
  });

  it("should distribute pot with updated tax structure", async () => {
    const instance = await Ecstasy.new();

    const owner = await instance.owner();
    const recipient = accounts[1];

    const from = accounts[0];
    const to = accounts[1];

    // ensure both parties are included in fees
    await instance.includeInFee(from);
    await instance.includeInFee(to);

    const transferAmount = 100000;
    await instance.transfer(to, transferAmount, { from });

    const initialOwnerBalance = await instance.balanceOf(owner);
    const initialRecipientBalance = await instance.balanceOf(recipient);

    // update the tax
    const newLotteryTax = DEFAULT_LOTTERY_TAX + 2;
    await instance.setLotteryTax(newLotteryTax);

    const currentPot = await instance.currentPot();

    // update lottery interval to avoid error
    await instance.setLotteryInterval(0, true);

    await instance.distribute(recipient);

    const ownerBalance = await instance.balanceOf(owner);
    const recipientBalance = await instance.balanceOf(recipient);

    const expectedOwnerTax = (currentPot * newLotteryTax) / 10 ** 2;
    const expectedReward = currentPot - expectedOwnerTax;

    const expectedRecipientBalance =
      parseInt(initialRecipientBalance) + parseInt(expectedReward);
    const expectedOwnerBalance =
      parseInt(initialOwnerBalance) + parseInt(expectedOwnerTax);

    assert.equal(
      recipientBalance,
      expectedRecipientBalance,
      "RECIPIENT balance mismatch"
    );
    assert.equal(ownerBalance, expectedOwnerBalance, "OWNER balance mismatch");
  });

  it("setTransactionFee - should throw error (onlyOwner)", async () => {
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.setTransactionFee(3, { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.setLotteryFee(3, { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.setLotteryTax(3, { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.excludeFromFee(accounts[1], { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.includeInFee(accounts[1], { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.excludeAccount(accounts[1], { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.includeAccount(accounts[1], { from: notOwner });
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
    const instance = await Ecstasy.new();
    const notOwner = accounts[5];

    try {
      await instance.setLotteryInterval(10, false, { from: notOwner });
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(
        e.reason,
        "Ownable: caller is not the owner",
        "Did not throw correct error"
      );
    }
  });

  it("distribute - should throw error (UNAVAILABLE)", async () => {
    const instance = await Ecstasy.new();

    const interval = 30 * 60 * 60 * 24; // 30 days
    await instance.setLotteryInterval(interval, true);

    try {
      await instance.distribute(accounts[1]);
      throw new Error("not the expected error");
    } catch (e) {
      assert.equal(e.reason, "UNAVAILABLE", "Did not throw correct error");
    }
  });
});
