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
 */

pragma solidity ^0.8.4;

// SPDX-License-Identifier: GPL-3.0-only

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract Ecstasy is Context, IERC20, Ownable {
  using SafeMath for uint256;
  using Address for address;

  mapping(address => uint256) private _rOwned;
  mapping(address => uint256) private _tOwned;
  mapping(address => mapping(address => uint256)) private _allowances;

  mapping(address => bool) private _isExcludedFromFee;

  mapping(address => bool) private _isExcluded;
  address[] private _excluded;

  uint256 private constant MAX = ~uint256(0);
  uint256 private constant _tTotal = 100 * 10**6 * 10**9;
  uint256 private _rTotal = (MAX - (MAX % _tTotal));
  uint256 private _tFeeTotal;

  uint256 private _transactionFee = 2;
  uint256 private _previousTransactionFee = _transactionFee;

  uint256 private _lotteryFee = 3;
  uint256 private _previousLotteryFee = _lotteryFee;

  uint256 private _lotteryTax = 2;
  uint256 private _previousLotteryTax = _lotteryTax;

  string private _name = "Ecstasy";
  string private _symbol = "E";
  uint8 private _decimals = 9;

  constructor() {
    _rOwned[_msgSender()] = _rTotal;

    // exclude both the owner and the contract from all fees
    _isExcludedFromFee[owner()] = true;
    _isExcludedFromFee[address(this)] = true;

    // exclude the contract from fee distribution
    _isExcluded[address(this)] = true;
    _excluded.push(address(this));

    emit Transfer(address(0), _msgSender(), _tTotal);
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

  function totalSupply() public pure override returns (uint256) {
    return _tTotal;
  }

  function balanceOf(address account) public view override returns (uint256) {
    if (_isExcluded[account]) return _tOwned[account];
    return tokenFromReflection(_rOwned[account]);
  }

  function currentPot() public view returns (uint256) {
    if (_isExcluded[address(this)]) return _tOwned[address(this)];
    return tokenFromReflection(_rOwned[address(this)]);
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
    _rOwned[sender] = _rOwned[sender].sub(rAmount);
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
    if (_rOwned[account] > 0) {
      _tOwned[account] = tokenFromReflection(_rOwned[account]);
    }
    _isExcluded[account] = true;
    _excluded.push(account);
  }

  function includeAccount(address account) external onlyOwner() {
    require(_isExcluded[account], "Account is already included");
    for (uint256 i = 0; i < _excluded.length; i++) {
      if (_excluded[i] == account) {
        _excluded[i] = _excluded[_excluded.length - 1];
        _tOwned[account] = 0;
        _isExcluded[account] = false;
        _excluded.pop();
        break;
      }
    }
  }

  function distributePot(address account) public onlyOwner() {
    require(!_isExcluded[account], "Winner must not be excluded from rewards");
    _distributePot(account);
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
    if (!takeFee) removeAllFee();

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

    if (!takeFee) restoreAllFee();
  }

  function _transferStandard(
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
    _rOwned[sender] = _rOwned[sender].sub(rAmount);
    _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectFee(rFee, tTransactionFee);
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
    _rOwned[sender] = _rOwned[sender].sub(rAmount);
    _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
    _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectFee(rFee, tTransactionFee);
    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _transferFromExcluded(
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
    _rOwned[sender] = _rOwned[sender].sub(rAmount);
    _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectFee(rFee, tTransactionFee);
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
    _rOwned[sender] = _rOwned[sender].sub(rAmount);
    _tOwned[recipient] = _tOwned[recipient].add(tTransferAmount);
    _rOwned[recipient] = _rOwned[recipient].add(rTransferAmount);
    _takeLotteryFee(tLotteryFee);
    _reflectFee(rFee, tTransactionFee);
    emit Transfer(sender, recipient, tTransferAmount);
  }

  function _reflectFee(uint256 rFee, uint256 tTransactionFee) private {
    _rTotal = _rTotal.sub(rFee);
    _tFeeTotal = _tFeeTotal.add(tTransactionFee);
  }

  function _takeLotteryFee(uint256 tLotteryFee) private {
    uint256 currentRate = _getRate();
    uint256 rLotteryFee = tLotteryFee.mul(currentRate);
    _rOwned[address(this)] = _rOwned[address(this)].add(rLotteryFee);

    if (_isExcluded[address(this)])
      _tOwned[address(this)] = _tOwned[address(this)].add(tLotteryFee);
  }

  function _distributePot(address account) private {
    uint256 reward = _rOwned[address(this)];

    if (_isExcluded[address(this)])
      /*
       * Winner is always included in reward, so convert token to reflection
       * Do NOT take fees during the conversion
       */
      reward = reflectionFromToken(_tOwned[address(this)], false);

    uint256 tax = calculateLotteryTax(reward);
    uint256 rewardMinusTax = reward.sub(tax);

    _rOwned[account] = _rOwned[account].add(rewardMinusTax);

    /* for some fucking reason the full reward also gets transferred
     * to the owner if we need to get the current rate (if contract is excluded)
     *
     * COME BACK TO THIS
     */
    _takeLotteryTax(tax, reward, _isExcluded[address(this)]);
    _resetPot();
  }

  function _takeLotteryTax(
    uint256 tax,
    uint256 reward,
    bool removeReward
  ) private {
    address owner = owner();

    _rOwned[owner] = _rOwned[owner].add(tax);

    /* for some fucking reason the full reward also gets transferred
     * to the owner if we need to get the current rate (if contract is excluded)
     *
     * COME BACK TO THIS
     */
    if (removeReward) _rOwned[owner] = _rOwned[owner].sub(reward);

    if (_isExcluded[owner]) {
      tax = tokenFromReflection(tax);
      _tOwned[owner] = _tOwned[owner].add(tax);
    }
  }

  function _resetPot() private {
    if (_isExcluded[address(this)]) _tOwned[address(this)] = 0;
    else _rOwned[address(this)] = 0;
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
    uint256 tTransactionFee = calculateTransactionFee(tAmount);
    uint256 tLotteryFee = calculateLotteryFee(tAmount);
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
      if (_rOwned[_excluded[i]] > rSupply || _tOwned[_excluded[i]] > tSupply)
        return (_rTotal, _tTotal);
      rSupply = rSupply.sub(_rOwned[_excluded[i]]);
      tSupply = tSupply.sub(_tOwned[_excluded[i]]);
    }
    if (rSupply < _rTotal.div(_tTotal)) return (_rTotal, _tTotal);
    return (rSupply, tSupply);
  }

  function calculateTransactionFee(uint256 _amount)
    private
    view
    returns (uint256)
  {
    return _amount.mul(_transactionFee).div(10**2);
  }

  function calculateLotteryFee(uint256 _amount) private view returns (uint256) {
    return _amount.mul(_lotteryFee).div(10**2);
  }

  function calculateLotteryTax(uint256 _amount) private view returns (uint256) {
    return _amount.mul(_lotteryTax).div(10**2);
  }

  function removeAllFee() private {
    if (_transactionFee == 0 && _lotteryFee == 0) return;

    _previousTransactionFee = _transactionFee;
    _previousLotteryFee = _lotteryFee;

    _transactionFee = 0;
    _lotteryFee = 0;
  }

  function restoreAllFee() private {
    _transactionFee = _previousTransactionFee;
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
    _previousTransactionFee = _transactionFee;
    _transactionFee = fee;
  }

  function setLotteryFee(uint256 fee) public onlyOwner {
    _previousLotteryFee = _lotteryFee;
    _lotteryFee = fee;
  }

  function setLotteryTax(uint256 tax) public onlyOwner {
    _previousLotteryTax = _lotteryTax;
    _lotteryTax = tax;
  }
}
