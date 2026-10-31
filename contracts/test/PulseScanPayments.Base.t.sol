// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PulseScanPayments} from "../PulseScanPayments.sol";

/// @dev Treasury that rejects all native transfers.
contract RejectingTreasury {
    receive() external payable {
        revert("no eth");
    }
}

/// @dev Treasury that re-enters pay() and lets the revert bubble up.
contract ReentrantTreasury {
    PulseScanPayments public immutable target;

    constructor(PulseScanPayments t) {
        target = t;
    }

    receive() external payable {
        target.pay{value: msg.value}(PulseScanPayments.ScanType.Token, address(0xBEEF));
    }
}

/// @dev Treasury that tries to re-enter pay() but swallows the failure, then accepts funds.
contract SwallowingReentrantTreasury {
    PulseScanPayments public immutable target;
    bool public attempted;
    bool public reentrySucceeded;
    bytes public reentryRevertData;

    constructor(PulseScanPayments t) {
        target = t;
    }

    receive() external payable {
        attempted = true;
        try target.pay{value: msg.value}(PulseScanPayments.ScanType.Token, address(0xBEEF)) {
            reentrySucceeded = true;
        } catch (bytes memory data) {
            reentryRevertData = data;
        }
    }
}

abstract contract PulseScanPaymentsTestBase is Test {
    PulseScanPayments internal pay_;
    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal scanTarget = makeAddr("scanTarget");

    uint256 internal constant PRICE = 0.01e18;
    uint256 internal constant MAX_PRICE = 1e18;

    function setUp() public virtual {
        pay_ = new PulseScanPayments(owner, treasury, PRICE);
        vm.deal(alice, 100e18);
        vm.deal(bob, 100e18);
    }
}
