const Lottery = artifacts.require("Lottery");
const Ecstasy = artifacts.require("Ecstasy");

module.exports = async function (deployer) {
  deployer.deploy(Lottery).then(function () {
    return deployer.deploy(Ecstasy, Lottery.address);
  });
};
