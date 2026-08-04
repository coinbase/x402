#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════╗
# ║  SUBSTRATO 252 — SOFTWARE DISTRIBUTION ONTOLOGY (SDX-ARKHE)    ║
# ║  Glosa 252 • Ontologia formal para distribuição de software     ║
# ║  Standards: SPDX 3.0, OWL 2 DL, JSON-LD, GRC-20                 ║
# ║  Architect: ORCID 0009-0005-2697-4668                            ║
# ╚══════════════════════════════════════════════════════════════════╝

"""
SDX-ARKHE — Software Distribution Ontology

Classes principais:
  sdx:Artifact      → Qualquer item de software distribuível
  sdx:Package       → Empacotamento específico com formato definido
  sdx:Version       → Ponto na história com semver
  sdx:Dependency    → Relação de necessidade entre artefatos
  sdx:Repository    → Fonte de distribuição
  sdx:License       → Licenciamento (SPDX identifiers)
  sdx:Checksum      → Hash criptográfico de integridade
  sdx:Signature     → Assinatura digital (GPG/ECDSA)
  sdx:BuildRecipe   → Instruções declarativas de build
  sdx:Provenance    → Metadados de produção (SLSA)

Propriedades de objeto:
  sdx:hasVersion, sdx:dependsOn, sdx:publishedAt, sdx:licensedUnder,
  sdx:hasChecksum, sdx:hasSignature, sdx:buildFrom, sdx:hasProvenance

Propriedades de dados:
  sdx:versionString, sdx:artifactName, sdx:checksumValue,
  sdx:licenseSPDX, sdx:repositoryURL, sdx:buildDate, sdx:buildEnvironment
"""

import json


class SDXArkhe:
    """Motor de descrição ontológica de artefatos de software."""

    SDX_NAMESPACE = "https://arkhe.org/ontology/sdx#"
    SPDX_NAMESPACE = "https://spdx.org/rdf/3.0.1/terms#"
    ARKHE_NAMESPACE = "https://arkhe.org/ontology/841#"

    CLASSES = [
        "Artifact",
        "Package",
        "Version",
        "Dependency",
        "Repository",
        "License",
        "Checksum",
        "Signature",
        "BuildRecipe",
        "Provenance",
    ]

    OBJECT_PROPERTIES = [
        "hasVersion",
        "dependsOn",
        "publishedAt",
        "licensedUnder",
        "hasChecksum",
        "hasSignature",
        "buildFrom",
        "hasProvenance",
    ]

    DATA_PROPERTIES = [
        "versionString",
        "artifactName",
        "checksumValue",
        "licenseSPDX",
        "repositoryURL",
        "buildDate",
        "buildEnvironment",
    ]

    def __init__(self):
        self.artifacts = []

    def create_artifact(
        self,
        name: str,
        version: str,
        license_spdx: str,
        checksum: str,
        repo_url: str,
        dependencies: list = None,
        signature: str = None,
        build_recipe: str = None,
        seal_hash: str = None,
    ) -> dict:
        """Cria um artefato SDX completo com JSON-LD."""
        artifact = {
            "@context": {
                "sdx": self.SDX_NAMESPACE,
                "spdx": self.SPDX_NAMESPACE,
                "arkhe": self.ARKHE_NAMESPACE,
            },
            "@type": "sdx:Package",
            "@id": f"arkhe:package/{name}/{version}",
            "sdx:artifactName": name,
            "sdx:hasVersion": {"@type": "sdx:Version", "sdx:versionString": version},
            "sdx:licensedUnder": {"@type": "sdx:License", "sdx:licenseSPDX": license_spdx},
            "sdx:hasChecksum": {"@type": "sdx:Checksum", "sdx:checksumValue": checksum},
            "sdx:publishedAt": {"@type": "sdx:Repository", "sdx:repositoryURL": repo_url},
            "sdx:dependsOn": dependencies or [],
            "arkhe:hasSeal": {
                "@type": "arkhe:Seal",
                "arkhe:hashAlgorithm": "SHA3-256",
                "arkhe:sealHash": seal_hash or "PENDING",
            },
        }
        if signature:
            artifact["sdx:hasSignature"] = {"@type": "sdx:Signature", "value": signature}
        if build_recipe:
            artifact["sdx:buildFrom"] = {"@type": "sdx:BuildRecipe", "recipe": build_recipe}

        self.artifacts.append(artifact)
        return artifact

    def to_jsonld(self, artifact: dict) -> str:
        return json.dumps(artifact, indent=2, ensure_ascii=False)

    def validate(self, artifact: dict) -> dict:
        """Valida a estrutura ontológica de um artefato."""
        errors = []
        required = ["sdx:artifactName", "sdx:hasVersion", "sdx:licensedUnder", "sdx:hasChecksum"]
        for field in required:
            if field not in artifact:
                errors.append(f"Missing required field: {field}")

        # Validar checksum como hex
        if "sdx:hasChecksum" in artifact:
            val = artifact["sdx:hasChecksum"].get("sdx:checksumValue", "")
            if not all(c in "0123456789abcdefABCDEF" for c in val):
                errors.append("checksumValue must be hexadecimal")

        # Validar SPDX license
        valid_spdx = ["MIT", "Apache-2.0", "AGPL-3.0-only", "GPL-3.0-only", "BSD-3-Clause"]
        if "sdx:licensedUnder" in artifact:
            lic = artifact["sdx:licensedUnder"].get("sdx:licenseSPDX", "")
            if lic not in valid_spdx:
                errors.append(f"License '{lic}' not in canonical SPDX list")

        return {"valid": len(errors) == 0, "errors": errors, "checks_passed": 4 - len(errors)}


if __name__ == "__main__":
    sdx = SDXArkhe()
    pkg = sdx.create_artifact(
        name="arkheos-kernel",
        version="2.3.0",
        license_spdx="Apache-2.0",
        checksum="7c1e8d3f9a2b5c6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
        repo_url="https://apt.arkhe.org",
        dependencies=[{"name": "glibc", "constraint": ">=2.31"}],
        seal_hash="a1b2c3d4e5f6a7b8",
    )
    print(sdx.to_jsonld(pkg))
    print("\nValidation:", sdx.validate(pkg))
