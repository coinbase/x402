// contracts/AGIIdentity.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@erc725/solidity/contracts/ERC725.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AGIIdentity is ERC725, AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    // Dados da AGI
    bytes32 public agent_id;          // Hash do npub/ORCID
    bytes32 public arweave_txid;      // Documento de identidade no Arweave
    uint256 public last_update;
    bool public is_active;

    // Governança
    struct Proposal {
        bytes32 descriptionHash;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        mapping(address => bool) voters;
    }
    Proposal[] public proposals;

    event IdentityUpdated(bytes32 indexed agentId, bytes32 arweaveTxid);
    event ProposalCreated(uint256 indexed proposalId, bytes32 descriptionHash);
    event Voted(uint256 indexed proposalId, address voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId);

    constructor(
        address owner,
        bytes32 _agent_id,
        bytes32 _arweave_txid,
        address[] memory _governors,
        address[] memory _agents
    ) ERC725(owner) {
        agent_id = _agent_id;
        arweave_txid = _arweave_txid;
        is_active = true;
        last_update = block.timestamp;

        _grantRole(DEFAULT_ADMIN_ROLE, owner);
        for (uint i = 0; i < _governors.length; i++) {
            _grantRole(GOVERNOR_ROLE, _governors[i]);
        }
        for (uint i = 0; i < _agents.length; i++) {
            _grantRole(AGENT_ROLE, _agents[i]);
        }
    }

    // ─── Identidade ───────────────────────────────────────────────────────

    function updateIdentity(bytes32 _new_arweave_txid) external onlyRole(AGENT_ROLE) {
        require(is_active, "Identity inactive");
        arweave_txid = _new_arweave_txid;
        last_update = block.timestamp;
        emit IdentityUpdated(agent_id, _new_arweave_txid);
    }

    function deactivate() external onlyRole(DEFAULT_ADMIN_ROLE) {
        is_active = false;
    }

    // ─── Governança ──────────────────────────────────────────────────────

    function createProposal(bytes32 _descriptionHash, uint256 _votingPeriodBlocks) external onlyRole(GOVERNOR_ROLE) {
        uint256 proposalId = proposals.length;
        Proposal storage prop = proposals.push();
        prop.descriptionHash = _descriptionHash;
        prop.startBlock = block.number;
        prop.endBlock = block.number + _votingPeriodBlocks;
        emit ProposalCreated(proposalId, _descriptionHash);
    }

    function vote(uint256 _proposalId, bool _support) external {
        require(hasRole(GOVERNOR_ROLE, msg.sender), "Not governor");
        Proposal storage prop = proposals[_proposalId];
        require(block.number >= prop.startBlock && block.number <= prop.endBlock, "Voting closed");
        require(!prop.voters[msg.sender], "Already voted");

        prop.voters[msg.sender] = true;
        if (_support) {
            prop.forVotes += 1;
        } else {
            prop.againstVotes += 1;
        }
        emit Voted(_proposalId, msg.sender, _support);
    }

    function executeProposal(uint256 _proposalId) external {
        Proposal storage prop = proposals[_proposalId];
        require(block.number > prop.endBlock, "Voting not closed");
        require(!prop.executed, "Already executed");
        require(prop.forVotes > prop.againstVotes, "Proposal failed");

        prop.executed = true;
        emit ProposalExecuted(_proposalId);

        // Exemplo: atualizar arweave_txid se a proposta for sobre isso
        // (pode ser generalizado com calldata)
        // bytes32 newTxid = ...; arweave_txid = newTxid;
    }
}
