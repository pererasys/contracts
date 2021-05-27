const Ecstasy = artifacts.require("Ecstasy");

const DEFAULT_SUPPLY = 100 * 10 ** 6 * 10 ** 9;

const DEFAULT_TRANSFER_FEE = 2;
const DEFAULT_LOTTERY_FEE = 3;
const DEFAULT_TOTAL_FEE = DEFAULT_LOTTERY_FEE + DEFAULT_TRANSFER_FEE;

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

  it("pot should be empty", async () => {
    const instance = await Ecstasy.new();
    const pot = await instance.currentPot();

    assert.equal(pot, 0, "Pot mismatch");
  });

  it("should transfer without fees", async () => {
    const from = accounts[0];
    const to = accounts[1];

    const instance = await Ecstasy.new();

    const initialBalanceFrom = await instance.balanceOf(from);

    const transferAmount = 100;

    await instance.transfer(to, transferAmount, { from });

    const balanceFrom = await instance.balanceOf(from);
    const balanceTo = await instance.balanceOf(to);

    const fees = await instance.totalFees();

    assert.equal(
      balanceFrom,
      initialBalanceFrom - transferAmount,
      "FROM balance mismatch"
    );
    assert.equal(balanceTo, transferAmount, "TO balance mismatch");
    assert.equal(fees, 0, "Fee mismatch");
  });

  it("should transfer with fees", async () => {
    const from = accounts[0];
    const to = accounts[1];

    const instance = await Ecstasy.new();

    const initialBalanceFrom = await instance.balanceOf(from);

    const transferAmount = 100;

    await instance.includeInFee(from);
    await instance.includeInFee(to);
    await instance.transfer(to, transferAmount, { from });

    const balanceFrom = await instance.balanceOf(from);
    const balanceTo = await instance.balanceOf(to);

    const transferFees = await instance.totalFees();
    const currentPot = await instance.currentPot();

    const expectedFees = (transferAmount * DEFAULT_TRANSFER_FEE) / 10 ** 2;
    const expectedPot = (transferAmount * DEFAULT_LOTTERY_FEE) / 10 ** 2;
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
});
