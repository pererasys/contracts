/**
 * @author Andrew Perera
 * Copyright (c) 2021
 *
 * 05/25/2021
 * - Fork of https://github.com/reflectfinance/reflect-contracts/blob/main/contracts/REFLECT.sol
 * - openzeppelin-solidity -> @openzeppelin/contracts
 * - Rename contract to Ecstasy
 *
 * 05/26/2021
 * - Reference some concepts from SAFEMOON (https://github.com/safemoonprotocol/Safemoon.sol)
 *   - Exclude some accounts from fees
 *   - Add ability to update fee structure
 * - Add transaction fee
 * - Add lottery fee
 * - Add lottery distribution
 * - Implement lottery tax to offset gas costs
 *
 * 06/01/2021
 * - Update distribution logic (provable oracle for random distribution)
 */

/**
 * Provable: > 0.6.1 < 0.7.0
 * OpenZeppelin@3.4.0: > 0.6.0 < 0.8.0
 */
pragma solidity ^0.6.9;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./ProvableAPI.sol";

/**
 * @dev
 * Manages the distributor for the lottery system. The distributor takes a 2% tax
 * from each lottery distribution to cover gas fees and more. Currently working on
 * a system to swap the tax (tokens) for BNB.
 *
 * Based on the Ownable contract from OpenZeppelin
 */
abstract contract Distributable is Context, Ownable {
  address private _distributor;

  event DistributorChanged(
    address indexed previousDistributor,
    address indexed newDistributor
  );

  constructor() public {
    address msgSender = _msgSender();
    _distributor = msgSender;
    emit DistributorChanged(address(0), msgSender);
  }

  function distributor() public view virtual returns (address) {
    return _distributor;
  }

  modifier onlyDistributor() {
    require(
      distributor() == _msgSender(),
      "Distributable: caller is not the distributor"
    );
    _;
  }

  function setDistributor(address newOwner) public virtual onlyOwner {
    require(
      newOwner != address(0),
      "Distributable: new distributor is the zero address"
    );
    _distributor = newOwner;
    emit DistributorChanged(_distributor, newOwner);
  }
}

contract Ecstasy is Context, IERC20, Ownable, Distributable, usingProvable {
  using SafeMath for uint256;
  using Address for address;

  /*
   * We need to manage each account's distribution ID efficiently
   * in order to include and exclude accounts from rewards. We do this
   * by storing the account's distribution set index with its reflection ownership.
   *
   * Excluded accounts will have an ID of ~uint256(0) which is the maximum
   * integer and assumed to be less than the length of the distribution set.
   */
  struct ReflectionOwnership {
    uint256 id;
    uint256 amount;
  }

  mapping(address => ReflectionOwnership) private _rOwned;
  mapping(address => uint256) private _tOwned;
  mapping(address => mapping(address => uint256)) private _allowances;

  mapping(address => bool) private _isExcludedFromFee;

  mapping(address => bool) private _isExcluded;
  address[] private _excluded;

  uint256 private constant MAX = ~uint256(0);
  uint256 private constant _tTotal = 100 * 10**6 * 10**9;
  uint256 private _rTotal = (MAX - (MAX % _tTotal));
  uint256 private _tFeeTotal;

  uint256 private _transferFee = 1;
  uint256 private _previousTransferFee = _transferFee;
  uint256 private _lotteryFee = 2;
  uint256 private _previousLotteryFee = _lotteryFee;

  /*
   * Initialize the next lottery to NOW so we can set a Lambda schedule
   * After the first distribution, the lottery schedule will reflect the interval
   */
  uint256 private _nextLottery = block.timestamp;
  uint256 private _lotteryInterval = 7 days;

  uint256 private _lotteryTax = 2;
  address[] private _distributionSet;

  string private _name = "Ecstasy";
  string private _symbol = "E";
  uint8 private _decimals = 9;

  constructor() public {
    address _contract = address(this);
    address _distributor = distributor();
    address _sender = _msgSender();

    _distributionSet.push(_sender);
    _rOwned[_sender].amount = _rTotal;
    _rOwned[_sender].id = _distributionSet.length - 1;

    // exclude both the owner and the contract from all fees
    _isExcludedFromFee[_sender] = true;
    _isExcludedFromFee[_contract] = true;
    _isExcludedFromFee[_distributor] = true;

    // exclude the contract from rewards
    _rOwned[_contract].id = ~uint256(0);
    _isExcluded[_contract] = true;
    _excluded.push(_contract);

    emit Transfer(address(0), _sender, _tTotal);
  }

  function name() public view returns (string memory) {
    return _name;
  }

  function symbol() public view returns (string memory) {
    return _symbol;
  }

  function decimals() public view returns (uint8) {
    return _decimals;
  }

  function totalSupply() public view override returns (uint256) {
    return _tTotal;
  }

  function balanceOf(address account) public view override returns (uint256) {
    if (_isExcluded[account]) return _tOwned[account];
    return tokenFromReflection(_rOwned[account].amount);
  }

  function nextLottery() public view returns (uint256) {
    return _nextLottery;
  }

  function currentPot() public view returns (uint256) {
    if (_isExcluded[address(this)]) return _tOwned[address(this)];
    return tokenFromReflection(_rOwned[address(this)].amount);
  }

  function transfer(address recipient, uint256 amount)
    public
    override
    returns (bool)
  {
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  function allowance(address owner, address spender)
    public
    view
    override
    returns (uint256)
  {
    return _allowances[owner][spender];
  }

  function approve(address spender, uint256 amount)
    public
    override
    returns (bool)
  {
    _approve(_msgSender(), spender, amount);
    return true;
  }

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) public override returns (bool) {
    _transfer(sender, recipient, amount);
    _approve(
      sender,
      _msgSender(),
      _allowances[sender][_msgSender()].sub(
        amount,
        "ERC20: transfer amount exceeds allowance"
      )
    );
    return true;
  }

  function increaseAllowance(address spender, uint256 addedValue)
    public
    virtual
    returns (bool)
  {
    _approve(
      _msgSender(),
      spender,
      _allowances[_msgSender()][spender].add(addedValue)
    );
    return true;
  }

  function decreaseAllowance(address spender, uint256 subtractedValue)
    public
    virtual
    returns (bool)
  {
    _approve(
      _msgSender(),
      spender,
      _allowances[_msgSender()][spender].sub(
        subtractedValue,
        "ERC20: decreased allowance below zero"
      )
    );
    return true;
  }

  function isExcluded(address account) public view returns (bool) {
    return _isExcluded[account];
  }

  function totalFees() public view returns (uint256) {
    return _tFeeTotal;
  }

  function reflect(uint256 tAmount) public {
    address sender = _msgSender();
    require(
      !_isExcluded[sender],
      "Excluded addresses cannot call this function"
    );
    (uint256 rAmount, , , , , ) = _getValues(tAmount);
    _rOwned[sender].amount = _rOwned[sender].amount.sub(rAmount);
    _rTotal = _rTotal.sub(rAmount);
    _tFeeTotal = _tFeeTotal.add(tAmount);
  }

  function reflectionFromToken(uint256 tAmount, bool deductTransferFee)
    public
    view
    returns (uint256)
  {
    require(tAmount <= _tTotal, "Amount must be less than supply");
    if (!deductTransferFee) {
      (uint256 rAmount, , , , , ) = _getValues(tAmount);
      return rAmount;
    } else {
      (, uint256 rTransferAmount, , , , ) = _getValues(tAmount);
      return rTransferAmount;
    }
  }

  function tokenFromReflection(uint256 rAmount) public view returns (uint256) {
    require(rAmount <= _rTotal, "Amount must be less than total reflections");
    uint256 currentRate = _getRate();
    return rAmount.div(currentRate);
  }

  function excludeAccount(address account) external onlyOwner() {
    require(!_isExcluded[account], "Account is already excluded");
    if (_rOwned[account].amount > 0) {
      _tOwned[account] = tokenFromReflection(_rOwned[account].amount);
    }
    _isExcluded[account] = true;
    _excluded.push(account);
    _removeFromDistributionSet(account);
  }

  function includeAccount(address account) external onlyOwner() {
    require(_isExcluded[account], "Account is already included");
    for (uint256 i = 0; i < _excluded.length; i++) {
      if (_excluded[i] == account) {
        _excluded[i] = _excluded[_excluded.length - 1];
        _tOwned[account] = 0;
        _isExcluded[account] = false;
        _excluded.pop();
        if (_rOwned[account].amount > 0) {
          _addToDistributionSet(account);
        }
        break;
      }
    }
  }

  function distribute() public onlyDistributor() {
    require(block.timestamp > _nextLottery, "UNAVAILABLE");
    provable_newRandomDSQuery(0, 7, 200000);
  }

  function __callback(
    bytes32 _queryId,
    string memory _result,
    bytes memory _proof
  ) public override {
    require(msg.sender == provable_cbAddress());
    if (
      provable_randomDS_proofVerify__returnCode(_queryId, _result, _proof) == 0
    ) {
      uint256 ceiling = _distributionSet.length;
      uint256 id = uint256(keccak256(abi.encodePacked(_result))) % ceiling;
      address recipient = _distributionSet[id];
      _distribute(recipient);
    } else revert("Unverified distribution");
  }

  function _distribute(address recipient) private {
    uint256 reward = _rOwned[address(this)].amount;

    if (_isExcluded[address(this)])
      reward = reflectionFromToken(_tOwned[address(this)], false);

    uint256 tax = _calculateLotteryTax(reward);
    uint256 rewardMinusTax = reward.sub(tax);

    _rOwned[recipient].amount = _rOwned[recipient].amount.add(rewardMinusTax);

    emit Transfer(address(this), recipient, rewardMinusTax);

    _takeLotteryTax(tax, reward, _isExcluded[address(this)]);
    _resetLottery();
  }

  function _takeLotteryTax(
    uint256 tax,
    uint256 reward,
    bool removeReward
  ) private {
    address distributor = distributor();

    _rOwned[distributor].amount = _rOwned[distributor].amount.add(tax);

    if (removeReward)
      _rOwned[distributor].amount = _rOwned[distributor].amount.sub(reward);
    if (_isExcluded[distributor]) {
      tax = tokenFromReflection(tax);
      _tOwned[distributor] = _tOwned[distributor].add(tax);
    }
  }

  function _resetLottery() private {
    _nextLottery = block.timestamp + _lotteryInterval;
    if (_isExcluded[address(this)]) _tOwned[address(this)] = 0;
    _rOwned[address(this)].amount = 0;
  }

  function _approve(
    address owner,
    address spender,
    uint256 amount
  ) private {
    require(owner != address(0), "ERC20: approve from the zero address");
    require(spender != address(0), "ERC20: approve to the zero address");

    _allowances[owner][spender] = amount;
    emit Approval(owner, spender, amount);
  }

  function _transfer(
    address sender,
    address recipient,
    uint256 amount
  ) private {
    require(sender != address(0), "ERC20: transfer from the zero address");
    require(recipient != address(0), "ERC20: transfer to the zero address");
    require(amount > 0, "Transfer amount must be greater than zero");

    bool takeFee = true;

    if (_isExcludedFromFee[sender] || _isExcludedFromFee[recipient])
      takeFee = false;

    _tokenTransfer(sender, recipient, amount, takeFee);
  }

  function _tokenTransfer(
    address sender,
    address recipient,
    uint256 amount,
    bool takeFee
  ) private {
    if (!takeFee) _removeAllFee();

    if (_isExcluded[sender] && !_isExcluded[recipient]) {
      _transferFromExcluded(sender, recipient, amount);
    } else if (!_isExcluded[sender] && _isExcluded[recipient]) {
      _transferToExcluded(sender, recipient, amount);
    } else if (!_isExcluded[sender] && !_isExcluded[recipient]) {
      _transferStandard(sender, recipient, amount);
    } else if (_isExcluded[sender] && _isExcluded[recipient]) {
      _transferBothExcluded(sender, recipient, amount);
    } else {
      _transferStandard(sender, recipient, amount);
    }

    if (!takeFee) _restoreAllFee();
  }

  function _transferStandard(
    address sender,
    address recipient,
    uint256 tAmount
  ) private {
    if (_rOwned[recipient].amount == 0) _addToDistributionSet(recipient);

    (
      uint256 rAmount,
      uint256 rTransferAmount,
      uint256 rFee,
      uint256 tTransferAmount,
      uint256 tTransactionFee,
      uint256 tLotteryFee
    ) = _getValues(tAmount);
    _rOwned[sender].amount = _rOwned[sender].amount.sub(rAmount);
    _rOwned[recipient].amount = _rOwned[recipient].amount.add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectTransactionFee(rFee, tTransactionFee);

    if (_rOwned[sender].amount == 0) _removeFromDistributionSet(recipient);

    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _transferToExcluded(
    address sender,
    address recipient,
    uint256 tAmount
  ) private {
    (
      uint256 rAmount,
      uint256 rTransferAmount,
      uint256 rFee,
      uint256 tTransferAmount,
      uint256 tTransactionFee,
      uint256 tLotteryFee
    ) = _getValues(tAmount);
    _rOwned[sender].amount = _rOwned[sender].amount.sub(rAmount);
    _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
    _rOwned[recipient].amount = _rOwned[recipient].amount.add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectTransactionFee(rFee, tTransactionFee);

    if (_rOwned[sender].amount == 0) _removeFromDistributionSet(recipient);

    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _transferFromExcluded(
    address sender,
    address recipient,
    uint256 tAmount
  ) private {
    if (_rOwned[recipient].amount == 0) _addToDistributionSet(recipient);

    (
      uint256 rAmount,
      uint256 rTransferAmount,
      uint256 rFee,
      uint256 tTransferAmount,
      uint256 tTransactionFee,
      uint256 tLotteryFee
    ) = _getValues(tAmount);

    _tOwned[sender] = _tOwned[sender].sub(tAmount);
    _rOwned[sender].amount = _rOwned[sender].amount.sub(rAmount);
    _rOwned[recipient].amount = _rOwned[recipient].amount.add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectTransactionFee(rFee, tTransactionFee);

    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _transferBothExcluded(
    address sender,
    address recipient,
    uint256 tAmount
  ) private {
    (
      uint256 rAmount,
      uint256 rTransferAmount,
      uint256 rFee,
      uint256 tTransferAmount,
      uint256 tTransactionFee,
      uint256 tLotteryFee
    ) = _getValues(tAmount);
    _tOwned[sender] = _tOwned[sender].sub(tAmount);
    _rOwned[sender].amount = _rOwned[sender].amount.sub(rAmount);
    _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
    _rOwned[recipient].amount = _rOwned[recipient].amount.add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectTransactionFee(rFee, tTransactionFee);
    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _reflectTransactionFee(uint256 rFee, uint256 tTransactionFee)
    private
  {
    _rTotal = _rTotal.sub(rFee);
    _tFeeTotal = _tFeeTotal.add(tTransactionFee);
  }

  function _takeLotteryFee(uint256 tLotteryFee) private {
    uint256 currentRate = _getRate();
    uint256 rLotteryFee = tLotteryFee.mul(currentRate);
    _rOwned[address(this)].amount = _rOwned[address(this)].amount.add(
      rLotteryFee
    );

    if (_isExcluded[address(this)])
      _tOwned[address(this)] = _tOwned[address(this)].add(tLotteryFee);
  }

  function _getValues(uint256 tAmount)
    private
    view
    returns (
      uint256,
      uint256,
      uint256,
      uint256,
      uint256,
      uint256
    )
  {
    (uint256 tTransferAmount, uint256 tTransactionFee, uint256 tLotteryFee) =
      _getTValues(tAmount);
    uint256 currentRate = _getRate();
    (uint256 rAmount, uint256 rTransferAmount, uint256 rTransactionFee) =
      _getRValues(tAmount, tTransactionFee, tLotteryFee, currentRate);
    return (
      rAmount,
      rTransferAmount,
      rTransactionFee,
      tTransferAmount,
      tTransactionFee,
      tLotteryFee
    );
  }

  function _getTValues(uint256 tAmount)
    private
    view
    returns (
      uint256,
      uint256,
      uint256
    )
  {
    uint256 tTransactionFee = _calculateTransactionFee(tAmount);
    uint256 tLotteryFee = _calculateLotteryFee(tAmount);
    uint256 tTransferAmount = tAmount.sub(tTransactionFee).sub(tLotteryFee);
    return (tTransferAmount, tTransactionFee, tLotteryFee);
  }

  function _getRValues(
    uint256 tAmount,
    uint256 tTransactionFee,
    uint256 tLotteryFee,
    uint256 currentRate
  )
    private
    pure
    returns (
      uint256,
      uint256,
      uint256
    )
  {
    uint256 rAmount = tAmount.mul(currentRate);
    uint256 rTransactionFee = tTransactionFee.mul(currentRate);
    uint256 rLotteryFee = tLotteryFee.mul(currentRate);
    uint256 rTransferAmount = rAmount.sub(rTransactionFee).sub(rLotteryFee);
    return (rAmount, rTransferAmount, rTransactionFee);
  }

  function _getRate() private view returns (uint256) {
    (uint256 rSupply, uint256 tSupply) = _getCurrentSupply();
    return rSupply.div(tSupply);
  }

  function _getCurrentSupply() private view returns (uint256, uint256) {
    uint256 rSupply = _rTotal;
    uint256 tSupply = _tTotal;
    for (uint256 i = 0; i < _excluded.length; i++) {
      if (
        _rOwned[_excluded[i]].amount > rSupply ||
        _tOwned[_excluded[i]] > tSupply
      ) return (_rTotal, _tTotal);
      rSupply = rSupply.sub(_rOwned[_excluded[i]].amount);
      tSupply = tSupply.sub(_tOwned[_excluded[i]]);
    }
    if (rSupply < _rTotal.div(_tTotal)) return (_rTotal, _tTotal);
    return (rSupply, tSupply);
  }

  function _addToDistributionSet(address account) private {
    _distributionSet.push(account);
    _rOwned[account].id = _distributionSet.length - 1;
  }

  function _removeFromDistributionSet(address account) private {
    uint256 id = _rOwned[account].id;

    if (_distributionSet[id] == account) {
      address swapped = _distributionSet[_distributionSet.length - 1];
      _distributionSet[id] = swapped;
      _rOwned[swapped].id = id;
      _distributionSet.pop();
    }

    _rOwned[account].id = ~uint256(0);
  }

  function _calculateTransactionFee(uint256 _amount)
    private
    view
    returns (uint256)
  {
    return _amount.mul(_transferFee).div(10**2);
  }

  function _calculateLotteryFee(uint256 _amount)
    private
    view
    returns (uint256)
  {
    return _amount.mul(_lotteryFee).div(10**2);
  }

  function _calculateLotteryTax(uint256 _amount)
    private
    view
    returns (uint256)
  {
    return _amount.mul(_lotteryTax).div(10**2);
  }

  function _removeAllFee() private {
    if (_transferFee == 0 && _lotteryFee == 0) return;

    _previousTransferFee = _transferFee;
    _previousLotteryFee = _lotteryFee;

    _transferFee = 0;
    _lotteryFee = 0;
  }

  function _restoreAllFee() private {
    _transferFee = _previousTransferFee;
    _lotteryFee = _previousLotteryFee;
  }

  function excludeFromFee(address account) public onlyOwner {
    _isExcludedFromFee[account] = true;
  }

  function includeInFee(address account) public onlyOwner {
    _isExcludedFromFee[account] = false;
  }

  function isExcludedFromFee(address account) public view returns (bool) {
    return _isExcludedFromFee[account];
  }

  function setTransactionFee(uint256 fee) public onlyOwner {
    require(fee <= 100, "Fee cannot be greater than 100%");
    _previousTransferFee = _transferFee;
    _transferFee = fee;
  }

  function setLotteryFee(uint256 fee) public onlyOwner {
    require(fee <= 100, "Fee cannot be greater than 100%");
    _previousLotteryFee = _lotteryFee;
    _lotteryFee = fee;
  }

  function setLotteryTax(uint256 tax) public onlyOwner {
    require(tax <= 100, "Tax cannot be greater than 100%");
    _lotteryTax = tax;
  }

  function setLotteryInterval(uint256 interval, bool update) public onlyOwner {
    if (update) _nextLottery = _nextLottery - _lotteryInterval + interval;
    _lotteryInterval = interval;
  }
}
