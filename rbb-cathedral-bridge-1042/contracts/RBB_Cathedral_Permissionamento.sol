// SPDX-License-Identifier: GPL-3.0
// Substrato 1042 - RBB-CATHEDRAL-BRIDGE
// Adapter para integração com Permissionamento RBB (gen02)
// Arquiteto: ORCID 0009-0005-2697-4668

pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface INodeRulesV2 {
    function addLocalNode(bytes32 enodeHigh, bytes32 enodeLow, uint8 nodeType, string calldata name) external;
    function updateLocalNodeStatus(bytes32 enodeHigh, bytes32 enodeLow, bool active) external;
    function connectionAllowed(bytes32 enodeHigh, bytes32 enodeLow) external view returns (bool);
}

interface IAccountRulesV2 {
    function addLocalAccount(address account, bytes32 roleId, bytes32 dataHash) external;
    function updateLocalAccountStatus(address account, bool active) external;
    function transactionAllowed(address sender, address target) external view returns (bool);
}

/**
 * @title RBB Cathedral Permissionamento Adapter
 * @notice Adapta o permissionamento RBB gen02 para o modelo Axiarchy da Catedral
 * @dev Mapeia hierarquia Theosis (P1-P7) para roles RBB
 */
contract RBB_Cathedral_Permissionamento is AccessControl {

    bytes32 public constant AXIARCHY_ADMIN = keccak256("AXIARCHY_ADMIN");
    bytes32 public constant RBB_ADMIN = keccak256("RBB_ADMIN");

    // Endereços dos contratos RBB (gen02)
    INodeRulesV2 public nodeRules;
    IAccountRulesV2 public accountRules;

    // Mapeamento Theosis → Role RBB
    enum TheosisLevel { P1, P2, P3, P4, P5, P6, P7 }

    struct CathedralIdentity {
        address account;
        TheosisLevel theosis;
        bytes32 orcidHash;
        bytes32 substrateSeal;
        bool active;
        uint256 registeredAt;
    }

    mapping(address => CathedralIdentity) public identities;
    mapping(bytes32 => address) public sealToAccount;
    mapping(TheosisLevel => bytes32) public theosisToRole;

    // Deidades associadas (referência ontológica)
    mapping(address => bytes32) public patronDeity;

    event IdentityRegistered(
        address indexed account,
        TheosisLevel theosis,
        bytes32 orcidHash,
        bytes32 substrateSeal
    );

    event TheosisUpdated(
        address indexed account,
        TheosisLevel oldLevel,
        TheosisLevel newLevel
    );

    event DeityAssigned(
        address indexed account,
        bytes32 indexed deity
    );

    constructor(address _nodeRules, address _accountRules, address _admin) {
        nodeRules = INodeRulesV2(_nodeRules);
        accountRules = IAccountRulesV2(_accountRules);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(AXIARCHY_ADMIN, _admin);
        _grantRole(RBB_ADMIN, _admin);

        // Mapear Theosis levels para roles RBB
        theosisToRole[TheosisLevel.P1] = keccak256("RBB_PARTICIPE_PARCEIRO");
        theosisToRole[TheosisLevel.P2] = keccak256("RBB_PARTICIPE_PARCEIRO");
        theosisToRole[TheosisLevel.P3] = keccak256("RBB_PARTICIPE_ASSOCIADO");
        theosisToRole[TheosisLevel.P4] = keccak256("RBB_PARTICIPE_ASSOCIADO");
        theosisToRole[TheosisLevel.P5] = keccak256("RBB_PARTICIPE_ASSOCIADO");
        theosisToRole[TheosisLevel.P6] = keccak256("RBB_PARTICIPE_PATRONO");
        theosisToRole[TheosisLevel.P7] = keccak256("RBB_PARTICIPE_PATRONO");
    }

    /**
     * @notice Registra identidade Catedral no permissionamento RBB
     */
    function registerIdentity(
        address _account,
        TheosisLevel _theosis,
        bytes32 _orcidHash,
        bytes32 _substrateSeal,
        bytes32 _enodeHigh,
        bytes32 _enodeLow,
        uint8 _nodeType,
        string calldata _nodeName
    ) external onlyRole(AXIARCHY_ADMIN) {
        require(identities[_account].account == address(0), "Adapter: identidade já existe");

        identities[_account] = CathedralIdentity({
            account: _account,
            theosis: _theosis,
            orcidHash: _orcidHash,
            substrateSeal: _substrateSeal,
            active: true,
            registeredAt: block.timestamp
        });

        sealToAccount[_substrateSeal] = _account;

        // Registrar no permissionamento RBB
        bytes32 roleId = theosisToRole[_theosis];
        accountRules.addLocalAccount(_account, roleId, _orcidHash);

        if (_enodeHigh != bytes32(0)) {
            nodeRules.addLocalNode(_enodeHigh, _enodeLow, _nodeType, _nodeName);
        }

        emit IdentityRegistered(_account, _theosis, _orcidHash, _substrateSeal);
    }

    /**
     * @notice Atualiza nível de Theosis (evolução na Catedral)
     */
    function updateTheosisLevel(
        address _account,
        TheosisLevel _newLevel
    ) external onlyRole(AXIARCHY_ADMIN) {
        CathedralIdentity storage identity = identities[_account];
        require(identity.account != address(0), "Adapter: identidade não encontrada");

        TheosisLevel oldLevel = identity.theosis;
        identity.theosis = _newLevel;

        // Atualizar role no permissionamento RBB
        bytes32 newRoleId = theosisToRole[_newLevel];
        accountRules.addLocalAccount(_account, newRoleId, identity.orcidHash);

        emit TheosisUpdated(_account, oldLevel, _newLevel);
    }

    /**
     * @notice Atribui deidade patrona (referência ontológica)
     */
    function assignDeity(
        address _account,
        bytes32 _deity
    ) external onlyRole(AXIARCHY_ADMIN) {
        require(identities[_account].account != address(0), "Adapter: identidade não encontrada");
        patronDeity[_account] = _deity;
        emit DeityAssigned(_account, _deity);
    }

    /**
     * @notice Verifica se conta pode realizar transação (compliance Axiarchy)
     */
    function canTransact(
        address _sender,
        address _target,
        uint256 _theosisThreshold
    ) external view returns (bool) {
        CathedralIdentity memory identity = identities[_sender];
        if (identity.account == address(0)) return false;
        if (!identity.active) return false;
        if (uint256(identity.theosis) < _theosisThreshold) return false;

        return accountRules.transactionAllowed(_sender, _target);
    }

    /**
     * @notice Desativa identidade (offboarding)
     */
    function deactivateIdentity(
        address _account,
        bytes32 _enodeHigh,
        bytes32 _enodeLow
    ) external onlyRole(AXIARCHY_ADMIN) {
        identities[_account].active = false;
        accountRules.updateLocalAccountStatus(_account, false);
        nodeRules.updateLocalNodeStatus(_enodeHigh, _enodeLow, false);
    }

    /**
     * @notice Recupera identidade por substrate seal
     */
    function getIdentityBySeal(bytes32 _seal) external view returns (CathedralIdentity memory) {
        return identities[sealToAccount[_seal]];
    }

    /**
     * @notice Lista deidades disponíveis (referência ontológica Catedral)
     */
    function getDeities() external pure returns (bytes32[] memory) {
        bytes32[] memory deities = new bytes32[](12);
        deities[0] = keccak256("Themis");      // Justiça
        deities[1] = keccak256("Athena");      // Sabedoria
        deities[2] = keccak256("Hermes");      // Mensageiro
        deities[3] = keccak256("Mnemosyne");   // Memória
        deities[4] = keccak256("Prometheus");  // Fogo/Tecnologia
        deities[5] = keccak256("Thoth");       // Conhecimento
        deities[6] = keccak256("Eros");        // Sinergia
        deities[7] = keccak256("Nemesis");     // Equilíbrio
        deities[8] = keccak256("Aether");      // Espaço
        deities[9] = keccak256("Chronos");     // Tempo
        deities[10] = keccak256("Ananke");     // Necessidade
        deities[11] = keccak256("Phanes");     // Manifestação
        return deities;
    }
}