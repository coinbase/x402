// SPDX-License-Identifier: GPL-3.0
// Substrato 1042.1 — BRICS+ CATHEDRAL MESH
// Mesh de nós BRICS+ integrados à Catedral via RBB-CATHEDRAL-BRIDGE
// Arquiteto: ORCID 0009-0005-2697-4668
// Data: 2026-06-03

pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BRICS+ Cathedral Mesh
 * @notice Coordena nós BRICS+ na Catedral, mapeando CBDCs nacionais para Theosis
 * @dev Cada membro BRICS+ opera um nó regional com sua própria chain ID
 */
contract BRICS_Cathedral_Mesh is AccessControl, ReentrancyGuard {

    bytes32 public constant MESH_COORDINATOR = keccak256("MESH_COORDINATOR");
    bytes32 public constant COUNTRY_ADMIN = keccak256("COUNTRY_ADMIN");

    // ─── BRICS+ Members 2026 ───
    enum BRICSCountry {
        BRAZIL,      // 0 — DREX (Digital Real)
        RUSSIA,      // 1 — Digital Ruble
        INDIA,       // 2 — e-Rupee
        CHINA,       // 3 — e-CNY
        SOUTH_AFRICA,// 4 — Digital Rand
        EGYPT,       // 5 — (research phase)
        ETHIOPIA,    // 6 — (research phase)
        IRAN,        // 7 — (research phase)
        SAUDI_ARABIA,// 8 — (exploratory)
        UAE,         // 9 — Digital Dirham
        INDONESIA    // 10 — (pilot phase)
    }

    // Partner countries (2026)
    enum BRICSPartner {
        BELARUS,     // 0
        BOLIVIA,     // 1
        CUBA,        // 2
        KAZAKHSTAN,  // 3
        MALAYSIA,    // 4
        NIGERIA,     // 5
        THAILAND,    // 6
        UGANDA,      // 7
        UZBEKISTAN,  // 8
        VIETNAM      // 9
    }

    struct CountryNode {
        BRICSCountry country;
        uint256 chainId;           // Chain ID nacional ou regional
        address bridgeContract;    // Endereço do bridge local
        uint256 theosisLevel;      // Nível de Theosis do país [0, 10000]
        uint256 cbdcpVolume;       // Volume acumulado de CBDC
        bool active;
        uint256 joinedAt;
        bytes32 seal;              // Seal ontológico do país
    }

    struct CrossBorderMessage {
        bytes32 messageId;
        BRICSCountry source;
        BRICSCountry target;
        uint256 amount;
        bytes32 currencyPair;      // ex: "BRL-CNY"
        uint256 theosisRequired;   // Threshold mínimo
        bool executed;
        uint256 timestamp;
    }

    // Mappings
    mapping(BRICSCountry => CountryNode) public countryNodes;
    mapping(bytes32 => CrossBorderMessage) public crossBorderMessages;
    mapping(BRICSCountry => mapping(BRICSCountry => uint256)) public bilateralVolume;
    mapping(address => BRICSCountry) public operatorToCountry;

    // Aggregates
    uint256 public totalMeshVolume;
    uint256 public totalMessages;
    uint256 public activeCountries;

    // Events
    event CountryJoined(BRICSCountry indexed country, uint256 chainId, address bridge, bytes32 seal);
    event CrossBorderTx(
        bytes32 indexed messageId,
        BRICSCountry indexed source,
        BRICSCountry indexed target,
        uint256 amount,
        bytes32 currencyPair
    );
    event TheosisUpdated(BRICSCountry indexed country, uint256 oldLevel, uint256 newLevel);
    event MeshSync(uint256 timestamp, uint256 totalVolume, uint256 activeNodes);

    constructor(address _coordinator) {
        _grantRole(DEFAULT_ADMIN_ROLE, _coordinator);
        _grantRole(MESH_COORDINATOR, _coordinator);
    }

    /**
     * @notice Registra um país BRICS+ no mesh
     */
    function registerCountry(
        BRICSCountry _country,
        uint256 _chainId,
        address _bridgeContract,
        address _countryAdmin
    ) external onlyRole(MESH_COORDINATOR) {
        require(!countryNodes[_country].active, "Mesh: país já registrado");

        bytes32 seal = keccak256(abi.encodePacked(
            "BRICS-CATHEDRAL",
            uint256(_country),
            _chainId,
            block.timestamp
        ));

        countryNodes[_country] = CountryNode({
            country: _country,
            chainId: _chainId,
            bridgeContract: _bridgeContract,
            theosisLevel: 1000, // Default 10%
            cbdcpVolume: 0,
            active: true,
            joinedAt: block.timestamp,
            seal: seal
        });

        _grantRole(COUNTRY_ADMIN, _countryAdmin);
        operatorToCountry[_countryAdmin] = _country;
        activeCountries++;

        emit CountryJoined(_country, _chainId, _bridgeContract, seal);
    }

    /**
     * @notice Atualiza Theosis de um país (evolução ontológica)
     */
    function updateCountryTheosis(
        BRICSCountry _country,
        uint256 _newLevel
    ) external onlyRole(MESH_COORDINATOR) {
        require(countryNodes[_country].active, "Mesh: país inativo");
        require(_newLevel <= 10000, "Theosis: max 10000");

        uint256 oldLevel = countryNodes[_country].theosisLevel;
        countryNodes[_country].theosisLevel = _newLevel;

        emit TheosisUpdated(_country, oldLevel, _newLevel);
    }

    /**
     * @notice Executa transação cross-border BRICS+ com validação de Theosis
     */
    function executeCrossBorder(
        BRICSCountry _source,
        BRICSCountry _target,
        uint256 _amount,
        bytes32 _currencyPair,
        uint256 _theosisProof
    ) external onlyRole(COUNTRY_ADMIN) nonReentrant returns (bytes32) {
        require(countryNodes[_source].active, "Mesh: source inativo");
        require(countryNodes[_target].active, "Mesh: target inativo");
        require(_amount > 0, "Mesh: amount > 0");

        // Validar Theosis mínima do país remetente
        uint256 sourceTheosis = countryNodes[_source].theosisLevel;
        require(_theosisProof >= sourceTheosis, "Mesh: Theosis insuficiente");

        bytes32 messageId = keccak256(abi.encodePacked(
            _source,
            _target,
            _amount,
            _currencyPair,
            block.number,
            totalMessages
        ));

        crossBorderMessages[messageId] = CrossBorderMessage({
            messageId: messageId,
            source: _source,
            target: _target,
            amount: _amount,
            currencyPair: _currencyPair,
            theosisRequired: sourceTheosis,
            executed: true,
            timestamp: block.timestamp
        });

        bilateralVolume[_source][_target] += _amount;
        totalMeshVolume += _amount;
        totalMessages++;

        emit CrossBorderTx(messageId, _source, _target, _amount, _currencyPair);

        return messageId;
    }

    /**
     * @notice Sincroniza mesh (chamado periodicamente pelo coordenador)
     */
    function syncMesh() external onlyRole(MESH_COORDINATOR) {
        emit MeshSync(block.timestamp, totalMeshVolume, activeCountries);
    }

    /**
     * @notice View: estatísticas do mesh
     */
    function getMeshStats() external view returns (
        uint256 _totalVolume,
        uint256 _totalMessages,
        uint256 _activeCountries,
        uint256 _avgTheosis
    ) {
        uint256 sumTheosis = 0;
        for (uint i = 0; i <= 10; i++) {
            if (countryNodes[BRICSCountry(i)].active) {
                sumTheosis += countryNodes[BRICSCountry(i)].theosisLevel;
            }
        }

        return (
            totalMeshVolume,
            totalMessages,
            activeCountries,
            activeCountries > 0 ? sumTheosis / activeCountries : 0
        );
    }

    /**
     * @notice View: volume bilateral entre dois países
     */
    function getBilateralVolume(
        BRICSCountry _a,
        BRICSCountry _b
    ) external view returns (uint256) {
        return bilateralVolume[_a][_b] + bilateralVolume[_b][_a];
    }

    /**
     * @notice View: lista de países ativos
     */
    function getActiveCountries() external view returns (BRICSCountry[] memory) {
        BRICSCountry[] memory active = new BRICSCountry[](activeCountries);
        uint256 idx = 0;
        for (uint i = 0; i <= 10; i++) {
            if (countryNodes[BRICSCountry(i)].active) {
                active[idx] = BRICSCountry(i);
                idx++;
            }
        }
        return active;
    }
}
