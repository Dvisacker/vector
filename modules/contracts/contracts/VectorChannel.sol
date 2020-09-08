// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../../shared/libs/LibChannelCrypto.sol";


/// @title Vector Channel
/// @author Arjun Bhuptani <arjun@connext.network>
/// @notice
/// (a) A proxy to this contract is deployed per-channel using the ChannelFactory.sol contract
/// (b) Executes transactions dispute logic on a hardcoded Adjudicator.sol
/// (c) Supports executing arbitrary CALLs when called w/ commitment that has 2 signatures


// TODO how will this connect to the adjudicator? 

contract VectorChannel is IAdjudicator { //TODO write this interface

    using LibChannelCrypto for bytes32;

    mapping(bytes32 => bool) isExecuted;

    address[] private _owners;
    
    address private _adjudicatorAddress;

    enum Operation {
        Call,
        DelegateCall
    }


    struct LatestDeposit {
        uint256 amount;
        uint256 nonce;
    }

    uint256 private adjudicatorUpdateNonce;

    mapping(address => LatestDeposit) public latestDepositByAssetId;

    receive() external payable {}

    modifier onlyAdjudicator {
      require(msg.sender == _adjudicatorAddress);
      _;
    }

    /// @notice Contract constructor
    /// @param owners An array of unique addresses representing the multisig owners
    /// @param adjudicatorAddress Address of associated Adjudicator that we can call to
    function setup(address[] memory owners, address memory adjudicatorAddress) public {
        require(_owners.length == 0, "Contract has been set up before");
        _adjudicatorAddress = adjudicatorAddress
        _owners = owners;
    }

    /// @notice Alternative contract constructor that also allows for a deposit -- Perhaps merge into above?
    /// @param owners An array of unique addresses representing the multisig owners
    /// @param adjudicatorAddress Address of associated Adjudicator that we can call to
    /// @param amount Deposit amount for owners[0]
    /// @param assetId Asset for deposit
    /// @param signature Signature from owners[0] on deposit params // TODO do we need this?
    function setupWithDepositA(address[] memory owners, address memory adjudicatorAddress) public {
        require(_owners.length == 0, "Contract has been set up before");
        _adjudicatorAddress = adjudicatorAddress
        _owners = owners;
    }

    function depositA(
        uint256 amount,
        address assetId,
        bytes memory signature
    )
        public
        payable
        override
    {
        // TODO
        // This should validate signature against _owners[0], then save/upsert latestDepositByAssetId
    }

    // TODO gets called by the adjudicator contract in the event of a dispute to push out funds
    function adjudicatorTransfer(
        Balances[] balances,
        address assetId
    )
        public
        override
        onlyAdjudicator
        view
    {
        // TODO: replace w real logic
        require(to[0] == assetId, "oh boy");
        require(amount[0] > 0, "oh boy");
    }

    function updateAdjudicator(
        bytes[] memory signatures,
        uint256 nonce
        address newAdjudicator
    ) public {
        require(
            nonce > adjudicatorNonce,
            "Already upgraded using this nonce"
        );

        // TODO validate signatures

        _adjudicatorAddress = newAdjudicator;
    }

  /// @notice Execute an n-of-n signed transaction specified by a (to, value, data, op) tuple
    /// This transaction is a message CALL
    /// @param to The destination address of the message call
    /// @param value The amount of ETH being forwarded in the message call
    /// @param data Any calldata being sent along with the message call
    /// @param signatures A sorted bytes string of concatenated signatures of each owner
    function execTransaction(
        address to,
        uint256 value,
        bytes memory data,
        bytes[] memory signatures
    )
        public
        override
    {
        bytes32 transactionHash = getTransactionHash(
            to,
            value,
            data,
            Operation.Call // or delegatecall?
        );
        require(
            !isExecuted[transactionHash],
            "Transacation has already been executed"
        );

        isExecuted[transactionHash] = true;

        for (uint256 i = 0; i < _owners.length; i++) {
            require(
                _owners[i] == transactionHash.verifyChannelMessage(signatures[i]),
                "Invalid signature"
            );
        }

        execute(
            to,
            value,
            data
        );
    }

    /// @notice Compute a unique transaction hash for a particular (to, value, data, op) tuple
    /// @return A unique hash that owners are expected to sign and submit to
    /// @notice Note that two transactions with identical values of (to, value, data, op)
    /// are not distinguished.
    function getTransactionHash(
        address to,
        uint256 value,
        bytes memory data,
        Operation operation
    )
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                address(this),
                to,
                value,
                keccak256(data),
                uint8(operation)
            )
        );
    }

    /// @notice A getter function for the owners of the multisig
    /// @return An array of addresses representing the owners
    function getOwners()
        public
        view
        returns (address[] memory)
    {
        return _owners;
    }

    /// @notice Execute a CALL on behalf of the multisignature wallet
    /// @notice This is largely used for withdrawing from the channel + migrations
    /// @return success A boolean indicating if the transaction was successful or not
    function execute(address to, uint256 value, bytes memory data)
        internal
        returns (bool success)
    {
        assembly {
            success := call(not(0), to, value, add(data, 0x20), mload(data), 0, 0)
        }
    }
}