import re

content = open("proto/cathedral/v1/bridge.proto").read()
# Replace the entire MetaGovernanceVerdict enum
enum_pattern = r'enum MetaGovernanceVerdict \{[\s\S]*?\}'
replacement = """enum MetaGovernanceVerdict {
    META_GOVERNANCE_UNSPECIFIED = 0;
    META_APPROVED = 1;
    META_REJECTED = 2;
    REQUIRES_CEM_REVIEW = 3;
    META_CONDITIONAL = 4;
    DEFERRED = 5;
}"""
content = re.sub(enum_pattern, replacement, content)
open("proto/cathedral/v1/bridge.proto", "w").write(content)
