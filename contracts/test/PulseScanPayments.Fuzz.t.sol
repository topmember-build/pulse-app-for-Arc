// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PulseScanPayments} from "../PulseScanPayments.sol";
import {PulseScanPaymentsTestBase} from "./PulseScanPayments.Base.t.sol";

contract PulseScanPaymentsFuzzTest is PulseScanPaymentsTestBase {
    event ScanPaid(address indexed payer, address indexed target, PulseScanPayments.ScanType scanType, uint256 amount);

    function testFuzz_Pay_ForwardsEverythingAtOrAbovePrice(uint256 amount, address payer, address target, bool isContract)
        public
    {
        amount = bound(amount, PRICE, 1_000_000e18);
        vm.assume(payer != address(0) && target != address(0));
        vm.assume(payer != treasury && payer != address(pay_));
        vm.deal(payer, amount);
        PulseScanPayments.ScanType st =
            isContract ? PulseScanPayments.ScanType.Contract : PulseScanPayments.ScanType.Token;

        vm.expectEmit(true, true, false, true, address(pay_));
        emit ScanPaid(payer, target, st, amount);
        vm.prank(payer);
        pay_.pay{value: amount}(st, target);

        assertEq(treasury.balance, amount);
        assertEq(payer.balance, 0);
        assertEq(address(pay_).balance, 0);
    }

    function testFuzz_Pay_UnderpaymentReverts(uint256 amount) public {
        amount = bound(amount, 0, PRICE - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.PaymentTooLow.selector, amount, PRICE));
        pay_.pay{value: amount}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(treasury.balance, 0);
        assertEq(address(pay_).balance, 0);
    }

    function testFuzz_SetPrice_ThenPaymentThreshold(uint256 newPrice, uint256 amount) public {
        newPrice = bound(newPrice, 1, MAX_PRICE);
        amount = bound(amount, 0, 2 * MAX_PRICE);
        vm.prank(owner);
        pay_.setPrice(newPrice);
        assertEq(pay_.price(), newPrice);

        vm.deal(alice, amount);
        vm.prank(alice);
        if (amount < newPrice) {
            vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.PaymentTooLow.selector, amount, newPrice));
            pay_.pay{value: amount}(PulseScanPayments.ScanType.Token, scanTarget);
            assertEq(treasury.balance, 0);
        } else {
            pay_.pay{value: amount}(PulseScanPayments.ScanType.Token, scanTarget);
            assertEq(treasury.balance, amount);
        }
        assertEq(address(pay_).balance, 0);
    }

    function testFuzz_SetPrice_OutOfRangeReverts(uint256 bad) public {
        vm.assume(bad == 0 || bad > MAX_PRICE);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, bad));
        pay_.setPrice(bad);
        assertEq(pay_.price(), PRICE);
    }

    function testFuzz_Constructor_PriceRange(uint256 p) public {
        if (p == 0 || p > MAX_PRICE) {
            vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, p));
            new PulseScanPayments(owner, treasury, p);
        } else {
            assertEq(new PulseScanPayments(owner, treasury, p).price(), p);
        }
    }

    function testFuzz_SetPrice_NonOwnerReverts(address caller, uint256 p) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        pay_.setPrice(p);
    }

    function testFuzz_SetTreasury_RoutesFutureFunds(address newT, uint256 amount) public {
        vm.assume(newT != address(0) && newT.code.length == 0 && uint160(newT) > 0xFFFF);
        vm.assume(newT != alice && newT != address(pay_) && newT != address(vm));
        amount = bound(amount, PRICE, alice.balance);
        uint256 before = newT.balance;
        vm.prank(owner);
        pay_.setTreasury(newT);
        vm.prank(alice);
        pay_.pay{value: amount}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(newT.balance, before + amount);
        assertEq(address(pay_).balance, 0);
    }
}
