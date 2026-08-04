use proptest::prelude::*;
use arkhe_wormgraph::replication::{VersionVector, ConflictResolver, VersionedEntry, OperationType};
use std::collections::BTreeMap;

proptest! {
    #[test]
    fn test_version_vector_merge_is_commutative(
        clocks1 in prop::collection::vec((proptest::string::string_regex("[a-z][a-z0-9]*").unwrap(), 0u64..100), 1..10),
        clocks2 in prop::collection::vec((proptest::string::string_regex("[a-z][a-z0-9]*").unwrap(), 0u64..100), 1..10),
    ) {
        let mut map1 = BTreeMap::new();
        for (k, v) in clocks1 {
            map1.insert(k, v);
        }
        let mut map2 = BTreeMap::new();
        for (k, v) in clocks2 {
            map2.insert(k, v);
        }

        let vv1 = VersionVector { clocks: map1 };
        let vv2 = VersionVector { clocks: map2 };

        let merged1 = vv1.merge(&vv2);
        let merged2 = vv2.merge(&vv1);

        assert_eq!(merged1.clocks, merged2.clocks, "Merge deve ser comutativo");
    }
}
