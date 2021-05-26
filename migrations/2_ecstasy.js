var Ecstasy = artifacts.require("Ecstasy");

module.exports = function (deployer) {
  // deployment steps
  deployer.deploy(Ecstasy);
};
