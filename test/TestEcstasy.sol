pragma solidity ^0.8.4;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/Ecstasy.sol";

// SPDX-License-Identifier: GPL-3.0-only

contract TestEcstasy {
  uint256 expectedDecimals = 9;
  uint256 expectedSupply = 100 * 10**6 * 10**expectedDecimals;

  function testTotalSupply() public {
    Ecstasy instance = Ecstasy(DeployedAddresses.Ecstasy());

    Assert.equal(
      instance.totalSupply(),
      expectedSupply,
      "Total supply should match expected"
    );
  }

  function testDecimals() public {
    Ecstasy instance = Ecstasy(DeployedAddresses.Ecstasy());

    Assert.equal(
      instance.decimals(),
      expectedDecimals,
      "Total supply should match expected"
    );
  }

  function testOwnerBalance() public {
    Ecstasy instance = Ecstasy(DeployedAddresses.Ecstasy());

    Assert.equal(
      instance.balanceOf(tx.origin),
      expectedSupply,
      "Owner should have all Ecstasy initially"
    );
  }
}
