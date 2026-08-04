sed -i 's/GOV_META_APPROVED = 1;/GOV_APPROVED = 1;/g' proto/cathedral/v1/bridge.proto
sed -i 's/GOV_META_REJECTED = 2;/GOV_REJECTED = 2;/g' proto/cathedral/v1/bridge.proto
sed -i 's/GOV_META_CONDITIONAL = 4;/GOV_CONDITIONAL = 4;/g' proto/cathedral/v1/bridge.proto

sed -i 's/META_GOVERNANCE_UNSPECIFIED = 0;/META_GOVERNANCE_UNSPECIFIED = 0;\n    META_APPROVED = 1;\n    META_REJECTED = 2;\n    REQUIRES_CEM_REVIEW = 3;\n    META_CONDITIONAL = 4;\n    DEFERRED = 5;\n/g' proto/cathedral/v1/bridge.proto

# clean up duplicate enum fields
sed -i '/GOV_META_APPROVED = 1;/d' proto/cathedral/v1/bridge.proto
sed -i '/GOV_META_REJECTED = 2;/d' proto/cathedral/v1/bridge.proto
sed -i '/REQUIRES_CEM_REVIEW = 3;/d' proto/cathedral/v1/bridge.proto
sed -i '/GOV_META_CONDITIONAL = 4;/d' proto/cathedral/v1/bridge.proto
sed -i '/DEFERRED = 5;/d' proto/cathedral/v1/bridge.proto

# clean up duplicates we introduced
sed -i 's/META_GOVERNANCE_UNSPECIFIED = 0;/META_GOVERNANCE_UNSPECIFIED = 0;\n    META_APPROVED = 1;\n    META_REJECTED = 2;\n    REQUIRES_CEM_REVIEW = 3;\n    META_CONDITIONAL = 4;\n    DEFERRED = 5;/g' proto/cathedral/v1/bridge.proto

cat << 'EOF3' > fix_verdict.py
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
EOF3
python3 fix_verdict.py
