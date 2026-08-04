#![feature(prelude_import)]
extern crate std;
#[prelude_import]
use std::prelude::rust_2021::*;
pub mod shard {
    use serde::{Deserialize, Serialize};
    pub struct ProvenanceEvent {
        pub id: String,
        pub timestamp: i64,
        pub event_type: String,
        pub agent_id: String,
        pub parent_agent_id: Option<String>,
        pub tree_id: Option<String>,
        pub payload: serde_json::Value,
        pub entry_hash: Vec<u8>,
        pub project_id: String,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for ProvenanceEvent {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            let names: &'static _ = &[
                "id",
                "timestamp",
                "event_type",
                "agent_id",
                "parent_agent_id",
                "tree_id",
                "payload",
                "entry_hash",
                "project_id",
            ];
            let values: &[&dyn ::core::fmt::Debug] = &[
                &self.id,
                &self.timestamp,
                &self.event_type,
                &self.agent_id,
                &self.parent_agent_id,
                &self.tree_id,
                &self.payload,
                &self.entry_hash,
                &&self.project_id,
            ];
            ::core::fmt::Formatter::debug_struct_fields_finish(
                f,
                "ProvenanceEvent",
                names,
                values,
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for ProvenanceEvent {
        #[inline]
        fn clone(&self) -> ProvenanceEvent {
            ProvenanceEvent {
                id: ::core::clone::Clone::clone(&self.id),
                timestamp: ::core::clone::Clone::clone(&self.timestamp),
                event_type: ::core::clone::Clone::clone(&self.event_type),
                agent_id: ::core::clone::Clone::clone(&self.agent_id),
                parent_agent_id: ::core::clone::Clone::clone(&self.parent_agent_id),
                tree_id: ::core::clone::Clone::clone(&self.tree_id),
                payload: ::core::clone::Clone::clone(&self.payload),
                entry_hash: ::core::clone::Clone::clone(&self.entry_hash),
                project_id: ::core::clone::Clone::clone(&self.project_id),
            }
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl _serde::Serialize for ProvenanceEvent {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                let mut __serde_state = _serde::Serializer::serialize_struct(
                    __serializer,
                    "ProvenanceEvent",
                    false as usize + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "id",
                    &self.id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "timestamp",
                    &self.timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "event_type",
                    &self.event_type,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "agent_id",
                    &self.agent_id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "parent_agent_id",
                    &self.parent_agent_id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "tree_id",
                    &self.tree_id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "payload",
                    &self.payload,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "entry_hash",
                    &self.entry_hash,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "project_id",
                    &self.project_id,
                )?;
                _serde::ser::SerializeStruct::end(__serde_state)
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de> _serde::Deserialize<'de> for ProvenanceEvent {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __field1,
                    __field2,
                    __field3,
                    __field4,
                    __field5,
                    __field6,
                    __field7,
                    __field8,
                    __ignore,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "field identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            1u64 => _serde::__private228::Ok(__Field::__field1),
                            2u64 => _serde::__private228::Ok(__Field::__field2),
                            3u64 => _serde::__private228::Ok(__Field::__field3),
                            4u64 => _serde::__private228::Ok(__Field::__field4),
                            5u64 => _serde::__private228::Ok(__Field::__field5),
                            6u64 => _serde::__private228::Ok(__Field::__field6),
                            7u64 => _serde::__private228::Ok(__Field::__field7),
                            8u64 => _serde::__private228::Ok(__Field::__field8),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "id" => _serde::__private228::Ok(__Field::__field0),
                            "timestamp" => _serde::__private228::Ok(__Field::__field1),
                            "event_type" => _serde::__private228::Ok(__Field::__field2),
                            "agent_id" => _serde::__private228::Ok(__Field::__field3),
                            "parent_agent_id" => {
                                _serde::__private228::Ok(__Field::__field4)
                            }
                            "tree_id" => _serde::__private228::Ok(__Field::__field5),
                            "payload" => _serde::__private228::Ok(__Field::__field6),
                            "entry_hash" => _serde::__private228::Ok(__Field::__field7),
                            "project_id" => _serde::__private228::Ok(__Field::__field8),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"id" => _serde::__private228::Ok(__Field::__field0),
                            b"timestamp" => _serde::__private228::Ok(__Field::__field1),
                            b"event_type" => _serde::__private228::Ok(__Field::__field2),
                            b"agent_id" => _serde::__private228::Ok(__Field::__field3),
                            b"parent_agent_id" => {
                                _serde::__private228::Ok(__Field::__field4)
                            }
                            b"tree_id" => _serde::__private228::Ok(__Field::__field5),
                            b"payload" => _serde::__private228::Ok(__Field::__field6),
                            b"entry_hash" => _serde::__private228::Ok(__Field::__field7),
                            b"project_id" => _serde::__private228::Ok(__Field::__field8),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de> {
                    marker: _serde::__private228::PhantomData<ProvenanceEvent>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __Visitor<'de> {
                    type Value = ProvenanceEvent;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "struct ProvenanceEvent",
                        )
                    }
                    #[inline]
                    fn visit_seq<__A>(
                        self,
                        mut __seq: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::SeqAccess<'de>,
                    {
                        let __field0 = match _serde::de::SeqAccess::next_element::<
                            String,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        0usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field1 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        1usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field2 = match _serde::de::SeqAccess::next_element::<
                            String,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        2usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field3 = match _serde::de::SeqAccess::next_element::<
                            String,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        3usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field4 = match _serde::de::SeqAccess::next_element::<
                            Option<String>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        4usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field5 = match _serde::de::SeqAccess::next_element::<
                            Option<String>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        5usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field6 = match _serde::de::SeqAccess::next_element::<
                            serde_json::Value,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        6usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field7 = match _serde::de::SeqAccess::next_element::<
                            Vec<u8>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        7usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        let __field8 = match _serde::de::SeqAccess::next_element::<
                            String,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        8usize,
                                        &"struct ProvenanceEvent with 9 elements",
                                    ),
                                );
                            }
                        };
                        _serde::__private228::Ok(ProvenanceEvent {
                            id: __field0,
                            timestamp: __field1,
                            event_type: __field2,
                            agent_id: __field3,
                            parent_agent_id: __field4,
                            tree_id: __field5,
                            payload: __field6,
                            entry_hash: __field7,
                            project_id: __field8,
                        })
                    }
                    #[inline]
                    fn visit_map<__A>(
                        self,
                        mut __map: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::MapAccess<'de>,
                    {
                        let mut __field0: _serde::__private228::Option<String> = _serde::__private228::None;
                        let mut __field1: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field2: _serde::__private228::Option<String> = _serde::__private228::None;
                        let mut __field3: _serde::__private228::Option<String> = _serde::__private228::None;
                        let mut __field4: _serde::__private228::Option<Option<String>> = _serde::__private228::None;
                        let mut __field5: _serde::__private228::Option<Option<String>> = _serde::__private228::None;
                        let mut __field6: _serde::__private228::Option<
                            serde_json::Value,
                        > = _serde::__private228::None;
                        let mut __field7: _serde::__private228::Option<Vec<u8>> = _serde::__private228::None;
                        let mut __field8: _serde::__private228::Option<String> = _serde::__private228::None;
                        while let _serde::__private228::Some(__key) = _serde::de::MapAccess::next_key::<
                            __Field,
                        >(&mut __map)? {
                            match __key {
                                __Field::__field0 => {
                                    if _serde::__private228::Option::is_some(&__field0) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field("id"),
                                        );
                                    }
                                    __field0 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<String>(&mut __map)?,
                                    );
                                }
                                __Field::__field1 => {
                                    if _serde::__private228::Option::is_some(&__field1) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "timestamp",
                                            ),
                                        );
                                    }
                                    __field1 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field2 => {
                                    if _serde::__private228::Option::is_some(&__field2) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "event_type",
                                            ),
                                        );
                                    }
                                    __field2 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<String>(&mut __map)?,
                                    );
                                }
                                __Field::__field3 => {
                                    if _serde::__private228::Option::is_some(&__field3) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "agent_id",
                                            ),
                                        );
                                    }
                                    __field3 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<String>(&mut __map)?,
                                    );
                                }
                                __Field::__field4 => {
                                    if _serde::__private228::Option::is_some(&__field4) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "parent_agent_id",
                                            ),
                                        );
                                    }
                                    __field4 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            Option<String>,
                                        >(&mut __map)?,
                                    );
                                }
                                __Field::__field5 => {
                                    if _serde::__private228::Option::is_some(&__field5) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "tree_id",
                                            ),
                                        );
                                    }
                                    __field5 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            Option<String>,
                                        >(&mut __map)?,
                                    );
                                }
                                __Field::__field6 => {
                                    if _serde::__private228::Option::is_some(&__field6) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "payload",
                                            ),
                                        );
                                    }
                                    __field6 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            serde_json::Value,
                                        >(&mut __map)?,
                                    );
                                }
                                __Field::__field7 => {
                                    if _serde::__private228::Option::is_some(&__field7) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "entry_hash",
                                            ),
                                        );
                                    }
                                    __field7 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<Vec<u8>>(&mut __map)?,
                                    );
                                }
                                __Field::__field8 => {
                                    if _serde::__private228::Option::is_some(&__field8) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "project_id",
                                            ),
                                        );
                                    }
                                    __field8 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<String>(&mut __map)?,
                                    );
                                }
                                _ => {
                                    let _ = _serde::de::MapAccess::next_value::<
                                        _serde::de::IgnoredAny,
                                    >(&mut __map)?;
                                }
                            }
                        }
                        let __field0 = match __field0 {
                            _serde::__private228::Some(__field0) => __field0,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("id")?
                            }
                        };
                        let __field1 = match __field1 {
                            _serde::__private228::Some(__field1) => __field1,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("timestamp")?
                            }
                        };
                        let __field2 = match __field2 {
                            _serde::__private228::Some(__field2) => __field2,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("event_type")?
                            }
                        };
                        let __field3 = match __field3 {
                            _serde::__private228::Some(__field3) => __field3,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("agent_id")?
                            }
                        };
                        let __field4 = match __field4 {
                            _serde::__private228::Some(__field4) => __field4,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("parent_agent_id")?
                            }
                        };
                        let __field5 = match __field5 {
                            _serde::__private228::Some(__field5) => __field5,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("tree_id")?
                            }
                        };
                        let __field6 = match __field6 {
                            _serde::__private228::Some(__field6) => __field6,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("payload")?
                            }
                        };
                        let __field7 = match __field7 {
                            _serde::__private228::Some(__field7) => __field7,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("entry_hash")?
                            }
                        };
                        let __field8 = match __field8 {
                            _serde::__private228::Some(__field8) => __field8,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("project_id")?
                            }
                        };
                        _serde::__private228::Ok(ProvenanceEvent {
                            id: __field0,
                            timestamp: __field1,
                            event_type: __field2,
                            agent_id: __field3,
                            parent_agent_id: __field4,
                            tree_id: __field5,
                            payload: __field6,
                            entry_hash: __field7,
                            project_id: __field8,
                        })
                    }
                }
                #[doc(hidden)]
                const FIELDS: &'static [&'static str] = &[
                    "id",
                    "timestamp",
                    "event_type",
                    "agent_id",
                    "parent_agent_id",
                    "tree_id",
                    "payload",
                    "entry_hash",
                    "project_id",
                ];
                _serde::Deserializer::deserialize_struct(
                    __deserializer,
                    "ProvenanceEvent",
                    FIELDS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<ProvenanceEvent>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    pub enum EventType {}
    pub struct Filter {}
    pub struct WormGraphShard {}
}
pub mod consistent_hasher {
    pub struct ConsistentHasher;
}
pub mod shard_manager {
    use crate::replication::QuorumStorage;
    use std::sync::Arc;
    pub struct ShardManager {
        storage: Arc<QuorumStorage<String>>,
    }
    impl ShardManager {
        pub async fn new(
            storage: Arc<QuorumStorage<String>>,
            _shards: usize,
        ) -> anyhow::Result<Self> {
            Ok(Self { storage })
        }
    }
}
pub mod storage {
    use anyhow::Result;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use crate::shard::ProvenanceEvent;
    use async_trait::async_trait;
    pub struct ShardMetadata {
        pub shard_id: u64,
        pub event_count: u64,
        pub first_timestamp: i64,
        pub last_timestamp: i64,
        pub size_bytes: u64,
        pub merkle_root: Vec<u8>,
        pub version: u64,
        #[serde(default)]
        pub extra: HashMap<String, serde_json::Value>,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for ShardMetadata {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            let names: &'static _ = &[
                "shard_id",
                "event_count",
                "first_timestamp",
                "last_timestamp",
                "size_bytes",
                "merkle_root",
                "version",
                "extra",
            ];
            let values: &[&dyn ::core::fmt::Debug] = &[
                &self.shard_id,
                &self.event_count,
                &self.first_timestamp,
                &self.last_timestamp,
                &self.size_bytes,
                &self.merkle_root,
                &self.version,
                &&self.extra,
            ];
            ::core::fmt::Formatter::debug_struct_fields_finish(
                f,
                "ShardMetadata",
                names,
                values,
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for ShardMetadata {
        #[inline]
        fn clone(&self) -> ShardMetadata {
            ShardMetadata {
                shard_id: ::core::clone::Clone::clone(&self.shard_id),
                event_count: ::core::clone::Clone::clone(&self.event_count),
                first_timestamp: ::core::clone::Clone::clone(&self.first_timestamp),
                last_timestamp: ::core::clone::Clone::clone(&self.last_timestamp),
                size_bytes: ::core::clone::Clone::clone(&self.size_bytes),
                merkle_root: ::core::clone::Clone::clone(&self.merkle_root),
                version: ::core::clone::Clone::clone(&self.version),
                extra: ::core::clone::Clone::clone(&self.extra),
            }
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl _serde::Serialize for ShardMetadata {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                let mut __serde_state = _serde::Serializer::serialize_struct(
                    __serializer,
                    "ShardMetadata",
                    false as usize + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "shard_id",
                    &self.shard_id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "event_count",
                    &self.event_count,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "first_timestamp",
                    &self.first_timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "last_timestamp",
                    &self.last_timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "size_bytes",
                    &self.size_bytes,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "merkle_root",
                    &self.merkle_root,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "version",
                    &self.version,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "extra",
                    &self.extra,
                )?;
                _serde::ser::SerializeStruct::end(__serde_state)
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de> _serde::Deserialize<'de> for ShardMetadata {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __field1,
                    __field2,
                    __field3,
                    __field4,
                    __field5,
                    __field6,
                    __field7,
                    __ignore,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "field identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            1u64 => _serde::__private228::Ok(__Field::__field1),
                            2u64 => _serde::__private228::Ok(__Field::__field2),
                            3u64 => _serde::__private228::Ok(__Field::__field3),
                            4u64 => _serde::__private228::Ok(__Field::__field4),
                            5u64 => _serde::__private228::Ok(__Field::__field5),
                            6u64 => _serde::__private228::Ok(__Field::__field6),
                            7u64 => _serde::__private228::Ok(__Field::__field7),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "shard_id" => _serde::__private228::Ok(__Field::__field0),
                            "event_count" => _serde::__private228::Ok(__Field::__field1),
                            "first_timestamp" => {
                                _serde::__private228::Ok(__Field::__field2)
                            }
                            "last_timestamp" => {
                                _serde::__private228::Ok(__Field::__field3)
                            }
                            "size_bytes" => _serde::__private228::Ok(__Field::__field4),
                            "merkle_root" => _serde::__private228::Ok(__Field::__field5),
                            "version" => _serde::__private228::Ok(__Field::__field6),
                            "extra" => _serde::__private228::Ok(__Field::__field7),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"shard_id" => _serde::__private228::Ok(__Field::__field0),
                            b"event_count" => _serde::__private228::Ok(__Field::__field1),
                            b"first_timestamp" => {
                                _serde::__private228::Ok(__Field::__field2)
                            }
                            b"last_timestamp" => {
                                _serde::__private228::Ok(__Field::__field3)
                            }
                            b"size_bytes" => _serde::__private228::Ok(__Field::__field4),
                            b"merkle_root" => _serde::__private228::Ok(__Field::__field5),
                            b"version" => _serde::__private228::Ok(__Field::__field6),
                            b"extra" => _serde::__private228::Ok(__Field::__field7),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de> {
                    marker: _serde::__private228::PhantomData<ShardMetadata>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __Visitor<'de> {
                    type Value = ShardMetadata;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "struct ShardMetadata",
                        )
                    }
                    #[inline]
                    fn visit_seq<__A>(
                        self,
                        mut __seq: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::SeqAccess<'de>,
                    {
                        let __field0 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        0usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field1 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        1usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field2 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        2usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field3 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        3usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field4 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        4usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field5 = match _serde::de::SeqAccess::next_element::<
                            Vec<u8>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        5usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field6 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        6usize,
                                        &"struct ShardMetadata with 8 elements",
                                    ),
                                );
                            }
                        };
                        let __field7 = match _serde::de::SeqAccess::next_element::<
                            HashMap<String, serde_json::Value>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                _serde::__private228::Default::default()
                            }
                        };
                        _serde::__private228::Ok(ShardMetadata {
                            shard_id: __field0,
                            event_count: __field1,
                            first_timestamp: __field2,
                            last_timestamp: __field3,
                            size_bytes: __field4,
                            merkle_root: __field5,
                            version: __field6,
                            extra: __field7,
                        })
                    }
                    #[inline]
                    fn visit_map<__A>(
                        self,
                        mut __map: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::MapAccess<'de>,
                    {
                        let mut __field0: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field1: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field2: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field3: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field4: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field5: _serde::__private228::Option<Vec<u8>> = _serde::__private228::None;
                        let mut __field6: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field7: _serde::__private228::Option<
                            HashMap<String, serde_json::Value>,
                        > = _serde::__private228::None;
                        while let _serde::__private228::Some(__key) = _serde::de::MapAccess::next_key::<
                            __Field,
                        >(&mut __map)? {
                            match __key {
                                __Field::__field0 => {
                                    if _serde::__private228::Option::is_some(&__field0) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "shard_id",
                                            ),
                                        );
                                    }
                                    __field0 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field1 => {
                                    if _serde::__private228::Option::is_some(&__field1) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "event_count",
                                            ),
                                        );
                                    }
                                    __field1 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field2 => {
                                    if _serde::__private228::Option::is_some(&__field2) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "first_timestamp",
                                            ),
                                        );
                                    }
                                    __field2 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field3 => {
                                    if _serde::__private228::Option::is_some(&__field3) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "last_timestamp",
                                            ),
                                        );
                                    }
                                    __field3 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field4 => {
                                    if _serde::__private228::Option::is_some(&__field4) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "size_bytes",
                                            ),
                                        );
                                    }
                                    __field4 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field5 => {
                                    if _serde::__private228::Option::is_some(&__field5) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "merkle_root",
                                            ),
                                        );
                                    }
                                    __field5 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<Vec<u8>>(&mut __map)?,
                                    );
                                }
                                __Field::__field6 => {
                                    if _serde::__private228::Option::is_some(&__field6) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "version",
                                            ),
                                        );
                                    }
                                    __field6 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field7 => {
                                    if _serde::__private228::Option::is_some(&__field7) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field("extra"),
                                        );
                                    }
                                    __field7 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            HashMap<String, serde_json::Value>,
                                        >(&mut __map)?,
                                    );
                                }
                                _ => {
                                    let _ = _serde::de::MapAccess::next_value::<
                                        _serde::de::IgnoredAny,
                                    >(&mut __map)?;
                                }
                            }
                        }
                        let __field0 = match __field0 {
                            _serde::__private228::Some(__field0) => __field0,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("shard_id")?
                            }
                        };
                        let __field1 = match __field1 {
                            _serde::__private228::Some(__field1) => __field1,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("event_count")?
                            }
                        };
                        let __field2 = match __field2 {
                            _serde::__private228::Some(__field2) => __field2,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("first_timestamp")?
                            }
                        };
                        let __field3 = match __field3 {
                            _serde::__private228::Some(__field3) => __field3,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("last_timestamp")?
                            }
                        };
                        let __field4 = match __field4 {
                            _serde::__private228::Some(__field4) => __field4,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("size_bytes")?
                            }
                        };
                        let __field5 = match __field5 {
                            _serde::__private228::Some(__field5) => __field5,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("merkle_root")?
                            }
                        };
                        let __field6 = match __field6 {
                            _serde::__private228::Some(__field6) => __field6,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("version")?
                            }
                        };
                        let __field7 = match __field7 {
                            _serde::__private228::Some(__field7) => __field7,
                            _serde::__private228::None => {
                                _serde::__private228::Default::default()
                            }
                        };
                        _serde::__private228::Ok(ShardMetadata {
                            shard_id: __field0,
                            event_count: __field1,
                            first_timestamp: __field2,
                            last_timestamp: __field3,
                            size_bytes: __field4,
                            merkle_root: __field5,
                            version: __field6,
                            extra: __field7,
                        })
                    }
                }
                #[doc(hidden)]
                const FIELDS: &'static [&'static str] = &[
                    "shard_id",
                    "event_count",
                    "first_timestamp",
                    "last_timestamp",
                    "size_bytes",
                    "merkle_root",
                    "version",
                    "extra",
                ];
                _serde::Deserializer::deserialize_struct(
                    __deserializer,
                    "ShardMetadata",
                    FIELDS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<ShardMetadata>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    pub trait ShardStorage: Send + Sync {
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn append_events<'life0, 'life1, 'async_trait>(
            &'life0 self,
            shard_id: u64,
            events: &'life1 [ProvenanceEvent],
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn read_events<'life0, 'async_trait>(
            &'life0 self,
            shard_id: u64,
            offset: usize,
            limit: usize,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<ProvenanceEvent>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn read_all_events<'life0, 'async_trait>(
            &'life0 self,
            shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<ProvenanceEvent>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn read_metadata<'life0, 'async_trait>(
            &'life0 self,
            shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Option<ShardMetadata>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn write_metadata<'life0, 'life1, 'async_trait>(
            &'life0 self,
            shard_id: u64,
            metadata: &'life1 ShardMetadata,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn delete_shard<'life0, 'async_trait>(
            &'life0 self,
            shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn list_shards<'life0, 'async_trait>(
            &'life0 self,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<u64>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
    }
}
pub mod storage_file {
    use anyhow::{anyhow, Result};
    use async_trait::async_trait;
    use serde::{Deserialize, Serialize};
    use std::collections::HashMap;
    use std::path::{Path, PathBuf};
    use std::sync::Arc;
    use std::time::{Duration, SystemTime};
    use tokio::fs;
    use tokio::io::AsyncWriteExt;
    use tokio::sync::RwLock;
    use tracing::{debug, info, warn};
    use crate::{ProvenanceEvent, storage::{ShardStorage, ShardMetadata}};
    pub struct FileStorageConfig {
        pub base_path: PathBuf,
        pub max_segment_size_bytes: u64,
        pub retention_days: u64,
        pub compaction_interval_secs: u64,
        pub enable_compaction: bool,
        pub enable_retention: bool,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for FileStorageConfig {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            let names: &'static _ = &[
                "base_path",
                "max_segment_size_bytes",
                "retention_days",
                "compaction_interval_secs",
                "enable_compaction",
                "enable_retention",
            ];
            let values: &[&dyn ::core::fmt::Debug] = &[
                &self.base_path,
                &self.max_segment_size_bytes,
                &self.retention_days,
                &self.compaction_interval_secs,
                &self.enable_compaction,
                &&self.enable_retention,
            ];
            ::core::fmt::Formatter::debug_struct_fields_finish(
                f,
                "FileStorageConfig",
                names,
                values,
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for FileStorageConfig {
        #[inline]
        fn clone(&self) -> FileStorageConfig {
            FileStorageConfig {
                base_path: ::core::clone::Clone::clone(&self.base_path),
                max_segment_size_bytes: ::core::clone::Clone::clone(
                    &self.max_segment_size_bytes,
                ),
                retention_days: ::core::clone::Clone::clone(&self.retention_days),
                compaction_interval_secs: ::core::clone::Clone::clone(
                    &self.compaction_interval_secs,
                ),
                enable_compaction: ::core::clone::Clone::clone(&self.enable_compaction),
                enable_retention: ::core::clone::Clone::clone(&self.enable_retention),
            }
        }
    }
    impl Default for FileStorageConfig {
        fn default() -> Self {
            Self {
                base_path: PathBuf::from("./wormgraph_data"),
                max_segment_size_bytes: 64 * 1024 * 1024,
                retention_days: 30,
                compaction_interval_secs: 3600,
                enable_compaction: true,
                enable_retention: true,
            }
        }
    }
    struct SegmentInfo {
        segment_id: u64,
        file_path: PathBuf,
        first_timestamp: i64,
        last_timestamp: i64,
        event_count: u64,
        size_bytes: u64,
        is_active: bool,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for SegmentInfo {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            let names: &'static _ = &[
                "segment_id",
                "file_path",
                "first_timestamp",
                "last_timestamp",
                "event_count",
                "size_bytes",
                "is_active",
            ];
            let values: &[&dyn ::core::fmt::Debug] = &[
                &self.segment_id,
                &self.file_path,
                &self.first_timestamp,
                &self.last_timestamp,
                &self.event_count,
                &self.size_bytes,
                &&self.is_active,
            ];
            ::core::fmt::Formatter::debug_struct_fields_finish(
                f,
                "SegmentInfo",
                names,
                values,
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for SegmentInfo {
        #[inline]
        fn clone(&self) -> SegmentInfo {
            SegmentInfo {
                segment_id: ::core::clone::Clone::clone(&self.segment_id),
                file_path: ::core::clone::Clone::clone(&self.file_path),
                first_timestamp: ::core::clone::Clone::clone(&self.first_timestamp),
                last_timestamp: ::core::clone::Clone::clone(&self.last_timestamp),
                event_count: ::core::clone::Clone::clone(&self.event_count),
                size_bytes: ::core::clone::Clone::clone(&self.size_bytes),
                is_active: ::core::clone::Clone::clone(&self.is_active),
            }
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl _serde::Serialize for SegmentInfo {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                let mut __serde_state = _serde::Serializer::serialize_struct(
                    __serializer,
                    "SegmentInfo",
                    false as usize + 1 + 1 + 1 + 1 + 1 + 1 + 1,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "segment_id",
                    &self.segment_id,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "file_path",
                    &self.file_path,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "first_timestamp",
                    &self.first_timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "last_timestamp",
                    &self.last_timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "event_count",
                    &self.event_count,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "size_bytes",
                    &self.size_bytes,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "is_active",
                    &self.is_active,
                )?;
                _serde::ser::SerializeStruct::end(__serde_state)
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de> _serde::Deserialize<'de> for SegmentInfo {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __field1,
                    __field2,
                    __field3,
                    __field4,
                    __field5,
                    __field6,
                    __ignore,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "field identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            1u64 => _serde::__private228::Ok(__Field::__field1),
                            2u64 => _serde::__private228::Ok(__Field::__field2),
                            3u64 => _serde::__private228::Ok(__Field::__field3),
                            4u64 => _serde::__private228::Ok(__Field::__field4),
                            5u64 => _serde::__private228::Ok(__Field::__field5),
                            6u64 => _serde::__private228::Ok(__Field::__field6),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "segment_id" => _serde::__private228::Ok(__Field::__field0),
                            "file_path" => _serde::__private228::Ok(__Field::__field1),
                            "first_timestamp" => {
                                _serde::__private228::Ok(__Field::__field2)
                            }
                            "last_timestamp" => {
                                _serde::__private228::Ok(__Field::__field3)
                            }
                            "event_count" => _serde::__private228::Ok(__Field::__field4),
                            "size_bytes" => _serde::__private228::Ok(__Field::__field5),
                            "is_active" => _serde::__private228::Ok(__Field::__field6),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"segment_id" => _serde::__private228::Ok(__Field::__field0),
                            b"file_path" => _serde::__private228::Ok(__Field::__field1),
                            b"first_timestamp" => {
                                _serde::__private228::Ok(__Field::__field2)
                            }
                            b"last_timestamp" => {
                                _serde::__private228::Ok(__Field::__field3)
                            }
                            b"event_count" => _serde::__private228::Ok(__Field::__field4),
                            b"size_bytes" => _serde::__private228::Ok(__Field::__field5),
                            b"is_active" => _serde::__private228::Ok(__Field::__field6),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de> {
                    marker: _serde::__private228::PhantomData<SegmentInfo>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __Visitor<'de> {
                    type Value = SegmentInfo;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "struct SegmentInfo",
                        )
                    }
                    #[inline]
                    fn visit_seq<__A>(
                        self,
                        mut __seq: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::SeqAccess<'de>,
                    {
                        let __field0 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        0usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field1 = match _serde::de::SeqAccess::next_element::<
                            PathBuf,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        1usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field2 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        2usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field3 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        3usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field4 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        4usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field5 = match _serde::de::SeqAccess::next_element::<
                            u64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        5usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        let __field6 = match _serde::de::SeqAccess::next_element::<
                            bool,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        6usize,
                                        &"struct SegmentInfo with 7 elements",
                                    ),
                                );
                            }
                        };
                        _serde::__private228::Ok(SegmentInfo {
                            segment_id: __field0,
                            file_path: __field1,
                            first_timestamp: __field2,
                            last_timestamp: __field3,
                            event_count: __field4,
                            size_bytes: __field5,
                            is_active: __field6,
                        })
                    }
                    #[inline]
                    fn visit_map<__A>(
                        self,
                        mut __map: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::MapAccess<'de>,
                    {
                        let mut __field0: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field1: _serde::__private228::Option<PathBuf> = _serde::__private228::None;
                        let mut __field2: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field3: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field4: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field5: _serde::__private228::Option<u64> = _serde::__private228::None;
                        let mut __field6: _serde::__private228::Option<bool> = _serde::__private228::None;
                        while let _serde::__private228::Some(__key) = _serde::de::MapAccess::next_key::<
                            __Field,
                        >(&mut __map)? {
                            match __key {
                                __Field::__field0 => {
                                    if _serde::__private228::Option::is_some(&__field0) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "segment_id",
                                            ),
                                        );
                                    }
                                    __field0 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field1 => {
                                    if _serde::__private228::Option::is_some(&__field1) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "file_path",
                                            ),
                                        );
                                    }
                                    __field1 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<PathBuf>(&mut __map)?,
                                    );
                                }
                                __Field::__field2 => {
                                    if _serde::__private228::Option::is_some(&__field2) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "first_timestamp",
                                            ),
                                        );
                                    }
                                    __field2 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field3 => {
                                    if _serde::__private228::Option::is_some(&__field3) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "last_timestamp",
                                            ),
                                        );
                                    }
                                    __field3 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field4 => {
                                    if _serde::__private228::Option::is_some(&__field4) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "event_count",
                                            ),
                                        );
                                    }
                                    __field4 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field5 => {
                                    if _serde::__private228::Option::is_some(&__field5) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "size_bytes",
                                            ),
                                        );
                                    }
                                    __field5 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<u64>(&mut __map)?,
                                    );
                                }
                                __Field::__field6 => {
                                    if _serde::__private228::Option::is_some(&__field6) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "is_active",
                                            ),
                                        );
                                    }
                                    __field6 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<bool>(&mut __map)?,
                                    );
                                }
                                _ => {
                                    let _ = _serde::de::MapAccess::next_value::<
                                        _serde::de::IgnoredAny,
                                    >(&mut __map)?;
                                }
                            }
                        }
                        let __field0 = match __field0 {
                            _serde::__private228::Some(__field0) => __field0,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("segment_id")?
                            }
                        };
                        let __field1 = match __field1 {
                            _serde::__private228::Some(__field1) => __field1,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("file_path")?
                            }
                        };
                        let __field2 = match __field2 {
                            _serde::__private228::Some(__field2) => __field2,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("first_timestamp")?
                            }
                        };
                        let __field3 = match __field3 {
                            _serde::__private228::Some(__field3) => __field3,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("last_timestamp")?
                            }
                        };
                        let __field4 = match __field4 {
                            _serde::__private228::Some(__field4) => __field4,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("event_count")?
                            }
                        };
                        let __field5 = match __field5 {
                            _serde::__private228::Some(__field5) => __field5,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("size_bytes")?
                            }
                        };
                        let __field6 = match __field6 {
                            _serde::__private228::Some(__field6) => __field6,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("is_active")?
                            }
                        };
                        _serde::__private228::Ok(SegmentInfo {
                            segment_id: __field0,
                            file_path: __field1,
                            first_timestamp: __field2,
                            last_timestamp: __field3,
                            event_count: __field4,
                            size_bytes: __field5,
                            is_active: __field6,
                        })
                    }
                }
                #[doc(hidden)]
                const FIELDS: &'static [&'static str] = &[
                    "segment_id",
                    "file_path",
                    "first_timestamp",
                    "last_timestamp",
                    "event_count",
                    "size_bytes",
                    "is_active",
                ];
                _serde::Deserializer::deserialize_struct(
                    __deserializer,
                    "SegmentInfo",
                    FIELDS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<SegmentInfo>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    pub struct HardenedFileStorage {
        config: FileStorageConfig,
        cache: Arc<RwLock<HashMap<u64, Vec<ProvenanceEvent>>>>,
        segments: Arc<RwLock<HashMap<u64, Vec<SegmentInfo>>>>,
        active_segment_writers: Arc<RwLock<HashMap<u64, tokio::fs::File>>>,
    }
    impl HardenedFileStorage {
        pub async fn new(config: FileStorageConfig) -> Result<Self> {
            fs::create_dir_all(&config.base_path).await?;
            let storage = Self {
                config,
                cache: Arc::new(RwLock::new(HashMap::new())),
                segments: Arc::new(RwLock::new(HashMap::new())),
                active_segment_writers: Arc::new(RwLock::new(HashMap::new())),
            };
            storage.load_segments().await?;
            if storage.config.enable_compaction {
                let s = storage.clone();
            }
            if storage.config.enable_retention {
                let s = storage.clone();
            }
            Ok(storage)
        }
        fn clone(&self) -> Self {
            Self {
                config: self.config.clone(),
                cache: self.cache.clone(),
                segments: self.segments.clone(),
                active_segment_writers: self.active_segment_writers.clone(),
            }
        }
        async fn load_segments(&self) -> Result<()> {
            Ok(())
        }
        async fn append_atomic(
            &self,
            shard_id: u64,
            events: &[ProvenanceEvent],
        ) -> Result<()> {
            Ok(())
        }
    }
    impl ShardStorage for HardenedFileStorage {
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn append_events<'life0, 'life1, 'async_trait>(
            &'life0 self,
            shard_id: u64,
            events: &'life1 [ProvenanceEvent],
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<()>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let shard_id = shard_id;
                let __ret: Result<()> = { __self.append_atomic(shard_id, events).await };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn read_events<'life0, 'async_trait>(
            &'life0 self,
            _shard_id: u64,
            _offset: usize,
            _limit: usize,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<ProvenanceEvent>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<Vec<ProvenanceEvent>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let _shard_id = _shard_id;
                let _offset = _offset;
                let _limit = _limit;
                let __ret: Result<Vec<ProvenanceEvent>> = { Ok(Vec::new()) };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn read_all_events<'life0, 'async_trait>(
            &'life0 self,
            _shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<ProvenanceEvent>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<Vec<ProvenanceEvent>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let _shard_id = _shard_id;
                let __ret: Result<Vec<ProvenanceEvent>> = { Ok(Vec::new()) };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn read_metadata<'life0, 'async_trait>(
            &'life0 self,
            _shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Option<ShardMetadata>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<Option<ShardMetadata>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let _shard_id = _shard_id;
                let __ret: Result<Option<ShardMetadata>> = { Ok(None) };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn write_metadata<'life0, 'life1, 'async_trait>(
            &'life0 self,
            _shard_id: u64,
            _metadata: &'life1 ShardMetadata,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<()>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let _shard_id = _shard_id;
                let __ret: Result<()> = { Ok(()) };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn delete_shard<'life0, 'async_trait>(
            &'life0 self,
            _shard_id: u64,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<()>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let _shard_id = _shard_id;
                let __ret: Result<()> = { Ok(()) };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn list_shards<'life0, 'async_trait>(
            &'life0 self,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Vec<u64>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<Vec<u64>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let __ret: Result<Vec<u64>> = { Ok(Vec::new()) };
                #[allow(unreachable_code)] __ret
            })
        }
    }
}
pub mod replication {
    use anyhow::{anyhow, Result};
    use serde::{Deserialize, Serialize};
    use std::collections::{BTreeMap, HashMap};
    use std::sync::Arc;
    use tokio::sync::RwLock;
    use tracing::{debug, error, warn};
    pub type NodeId = String;
    pub struct VersionVector {
        pub clocks: BTreeMap<NodeId, u64>,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for VersionVector {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            ::core::fmt::Formatter::debug_struct_field1_finish(
                f,
                "VersionVector",
                "clocks",
                &&self.clocks,
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for VersionVector {
        #[inline]
        fn clone(&self) -> VersionVector {
            VersionVector {
                clocks: ::core::clone::Clone::clone(&self.clocks),
            }
        }
    }
    #[automatically_derived]
    impl ::core::marker::StructuralPartialEq for VersionVector {}
    #[automatically_derived]
    impl ::core::cmp::PartialEq for VersionVector {
        #[inline]
        fn eq(&self, other: &VersionVector) -> bool {
            self.clocks == other.clocks
        }
    }
    #[automatically_derived]
    impl ::core::cmp::Eq for VersionVector {
        #[inline]
        #[doc(hidden)]
        #[coverage(off)]
        fn assert_receiver_is_total_eq(&self) -> () {
            let _: ::core::cmp::AssertParamIsEq<BTreeMap<NodeId, u64>>;
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl _serde::Serialize for VersionVector {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                let mut __serde_state = _serde::Serializer::serialize_struct(
                    __serializer,
                    "VersionVector",
                    false as usize + 1,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "clocks",
                    &self.clocks,
                )?;
                _serde::ser::SerializeStruct::end(__serde_state)
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de> _serde::Deserialize<'de> for VersionVector {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __ignore,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "field identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "clocks" => _serde::__private228::Ok(__Field::__field0),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"clocks" => _serde::__private228::Ok(__Field::__field0),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de> {
                    marker: _serde::__private228::PhantomData<VersionVector>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __Visitor<'de> {
                    type Value = VersionVector;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "struct VersionVector",
                        )
                    }
                    #[inline]
                    fn visit_seq<__A>(
                        self,
                        mut __seq: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::SeqAccess<'de>,
                    {
                        let __field0 = match _serde::de::SeqAccess::next_element::<
                            BTreeMap<NodeId, u64>,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        0usize,
                                        &"struct VersionVector with 1 element",
                                    ),
                                );
                            }
                        };
                        _serde::__private228::Ok(VersionVector { clocks: __field0 })
                    }
                    #[inline]
                    fn visit_map<__A>(
                        self,
                        mut __map: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::MapAccess<'de>,
                    {
                        let mut __field0: _serde::__private228::Option<
                            BTreeMap<NodeId, u64>,
                        > = _serde::__private228::None;
                        while let _serde::__private228::Some(__key) = _serde::de::MapAccess::next_key::<
                            __Field,
                        >(&mut __map)? {
                            match __key {
                                __Field::__field0 => {
                                    if _serde::__private228::Option::is_some(&__field0) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field("clocks"),
                                        );
                                    }
                                    __field0 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            BTreeMap<NodeId, u64>,
                                        >(&mut __map)?,
                                    );
                                }
                                _ => {
                                    let _ = _serde::de::MapAccess::next_value::<
                                        _serde::de::IgnoredAny,
                                    >(&mut __map)?;
                                }
                            }
                        }
                        let __field0 = match __field0 {
                            _serde::__private228::Some(__field0) => __field0,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("clocks")?
                            }
                        };
                        _serde::__private228::Ok(VersionVector { clocks: __field0 })
                    }
                }
                #[doc(hidden)]
                const FIELDS: &'static [&'static str] = &["clocks"];
                _serde::Deserializer::deserialize_struct(
                    __deserializer,
                    "VersionVector",
                    FIELDS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<VersionVector>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    impl VersionVector {
        pub fn new() -> Self {
            Self { clocks: BTreeMap::new() }
        }
        pub fn increment(&mut self, node_id: NodeId) {
            *self.clocks.entry(node_id).or_insert(0) += 1;
        }
        pub fn get(&self, node_id: &str) -> u64 {
            self.clocks.get(node_id).copied().unwrap_or(0)
        }
        pub fn is_descendant_of(&self, other: &VersionVector) -> bool {
            let mut has_less = false;
            for (node, &version) in &other.clocks {
                if let Some(&self_version) = self.clocks.get(node) {
                    if self_version < version {
                        return false;
                    }
                    if self_version > version {
                        has_less = true;
                    }
                } else {
                    if version > 0 {
                        return false;
                    }
                }
            }
            for (node, &version) in &self.clocks {
                if let Some(&other_version) = other.clocks.get(node) {
                    if version > other_version {
                        has_less = true;
                    }
                } else if version > 0 {
                    has_less = true;
                }
            }
            has_less
        }
        pub fn merge(&self, other: &VersionVector) -> VersionVector {
            let mut merged = self.clocks.clone();
            for (node, &version) in &other.clocks {
                let entry = merged.entry(node.clone()).or_insert(0);
                *entry = (*entry).max(version);
            }
            VersionVector { clocks: merged }
        }
    }
    pub struct VersionedEntry<T> {
        pub data: T,
        pub version: VersionVector,
        pub timestamp: i64,
        pub operation: OperationType,
    }
    #[automatically_derived]
    impl<T: ::core::fmt::Debug> ::core::fmt::Debug for VersionedEntry<T> {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            ::core::fmt::Formatter::debug_struct_field4_finish(
                f,
                "VersionedEntry",
                "data",
                &self.data,
                "version",
                &self.version,
                "timestamp",
                &self.timestamp,
                "operation",
                &&self.operation,
            )
        }
    }
    #[automatically_derived]
    impl<T: ::core::clone::Clone> ::core::clone::Clone for VersionedEntry<T> {
        #[inline]
        fn clone(&self) -> VersionedEntry<T> {
            VersionedEntry {
                data: ::core::clone::Clone::clone(&self.data),
                version: ::core::clone::Clone::clone(&self.version),
                timestamp: ::core::clone::Clone::clone(&self.timestamp),
                operation: ::core::clone::Clone::clone(&self.operation),
            }
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<T> _serde::Serialize for VersionedEntry<T>
        where
            T: _serde::Serialize,
        {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                let mut __serde_state = _serde::Serializer::serialize_struct(
                    __serializer,
                    "VersionedEntry",
                    false as usize + 1 + 1 + 1 + 1,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "data",
                    &self.data,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "version",
                    &self.version,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "timestamp",
                    &self.timestamp,
                )?;
                _serde::ser::SerializeStruct::serialize_field(
                    &mut __serde_state,
                    "operation",
                    &self.operation,
                )?;
                _serde::ser::SerializeStruct::end(__serde_state)
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de, T> _serde::Deserialize<'de> for VersionedEntry<T>
        where
            T: _serde::Deserialize<'de>,
        {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __field1,
                    __field2,
                    __field3,
                    __ignore,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "field identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            1u64 => _serde::__private228::Ok(__Field::__field1),
                            2u64 => _serde::__private228::Ok(__Field::__field2),
                            3u64 => _serde::__private228::Ok(__Field::__field3),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "data" => _serde::__private228::Ok(__Field::__field0),
                            "version" => _serde::__private228::Ok(__Field::__field1),
                            "timestamp" => _serde::__private228::Ok(__Field::__field2),
                            "operation" => _serde::__private228::Ok(__Field::__field3),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"data" => _serde::__private228::Ok(__Field::__field0),
                            b"version" => _serde::__private228::Ok(__Field::__field1),
                            b"timestamp" => _serde::__private228::Ok(__Field::__field2),
                            b"operation" => _serde::__private228::Ok(__Field::__field3),
                            _ => _serde::__private228::Ok(__Field::__ignore),
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de, T>
                where
                    T: _serde::Deserialize<'de>,
                {
                    marker: _serde::__private228::PhantomData<VersionedEntry<T>>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de, T> _serde::de::Visitor<'de> for __Visitor<'de, T>
                where
                    T: _serde::Deserialize<'de>,
                {
                    type Value = VersionedEntry<T>;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "struct VersionedEntry",
                        )
                    }
                    #[inline]
                    fn visit_seq<__A>(
                        self,
                        mut __seq: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::SeqAccess<'de>,
                    {
                        let __field0 = match _serde::de::SeqAccess::next_element::<
                            T,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        0usize,
                                        &"struct VersionedEntry with 4 elements",
                                    ),
                                );
                            }
                        };
                        let __field1 = match _serde::de::SeqAccess::next_element::<
                            VersionVector,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        1usize,
                                        &"struct VersionedEntry with 4 elements",
                                    ),
                                );
                            }
                        };
                        let __field2 = match _serde::de::SeqAccess::next_element::<
                            i64,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        2usize,
                                        &"struct VersionedEntry with 4 elements",
                                    ),
                                );
                            }
                        };
                        let __field3 = match _serde::de::SeqAccess::next_element::<
                            OperationType,
                        >(&mut __seq)? {
                            _serde::__private228::Some(__value) => __value,
                            _serde::__private228::None => {
                                return _serde::__private228::Err(
                                    _serde::de::Error::invalid_length(
                                        3usize,
                                        &"struct VersionedEntry with 4 elements",
                                    ),
                                );
                            }
                        };
                        _serde::__private228::Ok(VersionedEntry {
                            data: __field0,
                            version: __field1,
                            timestamp: __field2,
                            operation: __field3,
                        })
                    }
                    #[inline]
                    fn visit_map<__A>(
                        self,
                        mut __map: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::MapAccess<'de>,
                    {
                        let mut __field0: _serde::__private228::Option<T> = _serde::__private228::None;
                        let mut __field1: _serde::__private228::Option<VersionVector> = _serde::__private228::None;
                        let mut __field2: _serde::__private228::Option<i64> = _serde::__private228::None;
                        let mut __field3: _serde::__private228::Option<OperationType> = _serde::__private228::None;
                        while let _serde::__private228::Some(__key) = _serde::de::MapAccess::next_key::<
                            __Field,
                        >(&mut __map)? {
                            match __key {
                                __Field::__field0 => {
                                    if _serde::__private228::Option::is_some(&__field0) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field("data"),
                                        );
                                    }
                                    __field0 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<T>(&mut __map)?,
                                    );
                                }
                                __Field::__field1 => {
                                    if _serde::__private228::Option::is_some(&__field1) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "version",
                                            ),
                                        );
                                    }
                                    __field1 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            VersionVector,
                                        >(&mut __map)?,
                                    );
                                }
                                __Field::__field2 => {
                                    if _serde::__private228::Option::is_some(&__field2) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "timestamp",
                                            ),
                                        );
                                    }
                                    __field2 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<i64>(&mut __map)?,
                                    );
                                }
                                __Field::__field3 => {
                                    if _serde::__private228::Option::is_some(&__field3) {
                                        return _serde::__private228::Err(
                                            <__A::Error as _serde::de::Error>::duplicate_field(
                                                "operation",
                                            ),
                                        );
                                    }
                                    __field3 = _serde::__private228::Some(
                                        _serde::de::MapAccess::next_value::<
                                            OperationType,
                                        >(&mut __map)?,
                                    );
                                }
                                _ => {
                                    let _ = _serde::de::MapAccess::next_value::<
                                        _serde::de::IgnoredAny,
                                    >(&mut __map)?;
                                }
                            }
                        }
                        let __field0 = match __field0 {
                            _serde::__private228::Some(__field0) => __field0,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("data")?
                            }
                        };
                        let __field1 = match __field1 {
                            _serde::__private228::Some(__field1) => __field1,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("version")?
                            }
                        };
                        let __field2 = match __field2 {
                            _serde::__private228::Some(__field2) => __field2,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("timestamp")?
                            }
                        };
                        let __field3 = match __field3 {
                            _serde::__private228::Some(__field3) => __field3,
                            _serde::__private228::None => {
                                _serde::__private228::de::missing_field("operation")?
                            }
                        };
                        _serde::__private228::Ok(VersionedEntry {
                            data: __field0,
                            version: __field1,
                            timestamp: __field2,
                            operation: __field3,
                        })
                    }
                }
                #[doc(hidden)]
                const FIELDS: &'static [&'static str] = &[
                    "data",
                    "version",
                    "timestamp",
                    "operation",
                ];
                _serde::Deserializer::deserialize_struct(
                    __deserializer,
                    "VersionedEntry",
                    FIELDS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<VersionedEntry<T>>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    pub enum OperationType {
        Insert,
        Update,
        Delete,
    }
    #[automatically_derived]
    impl ::core::fmt::Debug for OperationType {
        #[inline]
        fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
            ::core::fmt::Formatter::write_str(
                f,
                match self {
                    OperationType::Insert => "Insert",
                    OperationType::Update => "Update",
                    OperationType::Delete => "Delete",
                },
            )
        }
    }
    #[automatically_derived]
    impl ::core::clone::Clone for OperationType {
        #[inline]
        fn clone(&self) -> OperationType {
            match self {
                OperationType::Insert => OperationType::Insert,
                OperationType::Update => OperationType::Update,
                OperationType::Delete => OperationType::Delete,
            }
        }
    }
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl _serde::Serialize for OperationType {
            fn serialize<__S>(
                &self,
                __serializer: __S,
            ) -> _serde::__private228::Result<__S::Ok, __S::Error>
            where
                __S: _serde::Serializer,
            {
                match *self {
                    OperationType::Insert => {
                        _serde::Serializer::serialize_unit_variant(
                            __serializer,
                            "OperationType",
                            0u32,
                            "Insert",
                        )
                    }
                    OperationType::Update => {
                        _serde::Serializer::serialize_unit_variant(
                            __serializer,
                            "OperationType",
                            1u32,
                            "Update",
                        )
                    }
                    OperationType::Delete => {
                        _serde::Serializer::serialize_unit_variant(
                            __serializer,
                            "OperationType",
                            2u32,
                            "Delete",
                        )
                    }
                }
            }
        }
    };
    #[doc(hidden)]
    #[allow(
        non_upper_case_globals,
        unused_attributes,
        unused_qualifications,
        clippy::absolute_paths,
    )]
    const _: () = {
        #[allow(unused_extern_crates, clippy::useless_attribute)]
        extern crate serde as _serde;
        #[automatically_derived]
        impl<'de> _serde::Deserialize<'de> for OperationType {
            fn deserialize<__D>(
                __deserializer: __D,
            ) -> _serde::__private228::Result<Self, __D::Error>
            where
                __D: _serde::Deserializer<'de>,
            {
                #[allow(non_camel_case_types)]
                #[doc(hidden)]
                enum __Field {
                    __field0,
                    __field1,
                    __field2,
                }
                #[doc(hidden)]
                struct __FieldVisitor;
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __FieldVisitor {
                    type Value = __Field;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "variant identifier",
                        )
                    }
                    fn visit_u64<__E>(
                        self,
                        __value: u64,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            0u64 => _serde::__private228::Ok(__Field::__field0),
                            1u64 => _serde::__private228::Ok(__Field::__field1),
                            2u64 => _serde::__private228::Ok(__Field::__field2),
                            _ => {
                                _serde::__private228::Err(
                                    _serde::de::Error::invalid_value(
                                        _serde::de::Unexpected::Unsigned(__value),
                                        &"variant index 0 <= i < 3",
                                    ),
                                )
                            }
                        }
                    }
                    fn visit_str<__E>(
                        self,
                        __value: &str,
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            "Insert" => _serde::__private228::Ok(__Field::__field0),
                            "Update" => _serde::__private228::Ok(__Field::__field1),
                            "Delete" => _serde::__private228::Ok(__Field::__field2),
                            _ => {
                                _serde::__private228::Err(
                                    _serde::de::Error::unknown_variant(__value, VARIANTS),
                                )
                            }
                        }
                    }
                    fn visit_bytes<__E>(
                        self,
                        __value: &[u8],
                    ) -> _serde::__private228::Result<Self::Value, __E>
                    where
                        __E: _serde::de::Error,
                    {
                        match __value {
                            b"Insert" => _serde::__private228::Ok(__Field::__field0),
                            b"Update" => _serde::__private228::Ok(__Field::__field1),
                            b"Delete" => _serde::__private228::Ok(__Field::__field2),
                            _ => {
                                let __value = &_serde::__private228::from_utf8_lossy(
                                    __value,
                                );
                                _serde::__private228::Err(
                                    _serde::de::Error::unknown_variant(__value, VARIANTS),
                                )
                            }
                        }
                    }
                }
                #[automatically_derived]
                impl<'de> _serde::Deserialize<'de> for __Field {
                    #[inline]
                    fn deserialize<__D>(
                        __deserializer: __D,
                    ) -> _serde::__private228::Result<Self, __D::Error>
                    where
                        __D: _serde::Deserializer<'de>,
                    {
                        _serde::Deserializer::deserialize_identifier(
                            __deserializer,
                            __FieldVisitor,
                        )
                    }
                }
                #[doc(hidden)]
                struct __Visitor<'de> {
                    marker: _serde::__private228::PhantomData<OperationType>,
                    lifetime: _serde::__private228::PhantomData<&'de ()>,
                }
                #[automatically_derived]
                impl<'de> _serde::de::Visitor<'de> for __Visitor<'de> {
                    type Value = OperationType;
                    fn expecting(
                        &self,
                        __formatter: &mut _serde::__private228::Formatter,
                    ) -> _serde::__private228::fmt::Result {
                        _serde::__private228::Formatter::write_str(
                            __formatter,
                            "enum OperationType",
                        )
                    }
                    fn visit_enum<__A>(
                        self,
                        __data: __A,
                    ) -> _serde::__private228::Result<Self::Value, __A::Error>
                    where
                        __A: _serde::de::EnumAccess<'de>,
                    {
                        match _serde::de::EnumAccess::variant(__data)? {
                            (__Field::__field0, __variant) => {
                                _serde::de::VariantAccess::unit_variant(__variant)?;
                                _serde::__private228::Ok(OperationType::Insert)
                            }
                            (__Field::__field1, __variant) => {
                                _serde::de::VariantAccess::unit_variant(__variant)?;
                                _serde::__private228::Ok(OperationType::Update)
                            }
                            (__Field::__field2, __variant) => {
                                _serde::de::VariantAccess::unit_variant(__variant)?;
                                _serde::__private228::Ok(OperationType::Delete)
                            }
                        }
                    }
                }
                #[doc(hidden)]
                const VARIANTS: &'static [&'static str] = &[
                    "Insert",
                    "Update",
                    "Delete",
                ];
                _serde::Deserializer::deserialize_enum(
                    __deserializer,
                    "OperationType",
                    VARIANTS,
                    __Visitor {
                        marker: _serde::__private228::PhantomData::<OperationType>,
                        lifetime: _serde::__private228::PhantomData,
                    },
                )
            }
        }
    };
    impl<T> VersionedEntry<T> {
        pub fn new(data: T, node_id: NodeId, op: OperationType) -> Self {
            let mut version = VersionVector::new();
            version.increment(node_id);
            Self {
                data,
                version,
                timestamp: chrono::Utc::now().timestamp(),
                operation: op,
            }
        }
        pub fn with_version(data: T, version: VersionVector, op: OperationType) -> Self {
            Self {
                data,
                version,
                timestamp: chrono::Utc::now().timestamp(),
                operation: op,
            }
        }
    }
    pub struct ConflictResolver;
    impl ConflictResolver {
        pub fn resolve<T: Clone>(
            a: &VersionedEntry<T>,
            b: &VersionedEntry<T>,
        ) -> (VersionedEntry<T>, bool) {
            if a.version.is_descendant_of(&b.version) {
                return (b.clone(), true);
            }
            if b.version.is_descendant_of(&a.version) {
                return (a.clone(), true);
            }
            let merged_version = a.version.merge(&b.version);
            let winner = if a.timestamp > b.timestamp { a } else { b };
            let resolved = VersionedEntry {
                data: winner.data.clone(),
                version: merged_version,
                timestamp: winner.timestamp,
                operation: winner.operation.clone(),
            };
            (resolved, false)
        }
    }
    pub struct QuorumStorage<T> {
        replicas: Vec<Arc<dyn ReplicaStorage<T>>>,
        read_quorum: usize,
        write_quorum: usize,
    }
    pub trait ReplicaStorage<T>: Send + Sync {
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn read<'life0, 'life1, 'async_trait>(
            &'life0 self,
            key: &'life1 str,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Option<VersionedEntry<T>>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn write<'life0, 'life1, 'life2, 'async_trait>(
            &'life0 self,
            key: &'life1 str,
            entry: &'life2 VersionedEntry<T>,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            'life2: 'async_trait,
            Self: 'async_trait;
        #[must_use]
        #[allow(
            elided_named_lifetimes,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds
        )]
        fn read_all<'life0, 'async_trait>(
            &'life0 self,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<HashMap<String, VersionedEntry<T>>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait;
    }
    impl<T: Clone + Send + Sync + 'static> QuorumStorage<T> {
        pub fn new(replicas: Vec<Arc<dyn ReplicaStorage<T>>>) -> Self {
            let n = replicas.len();
            let read_quorum = (n / 2) + 1;
            let write_quorum = (n / 2) + 1;
            Self {
                replicas,
                read_quorum,
                write_quorum,
            }
        }
        pub async fn write_quorum(
            &self,
            key: &str,
            entry: &VersionedEntry<T>,
        ) -> Result<()> {
            let mut successes = 0;
            let mut errors = Vec::new();
            for replica in &self.replicas {
                match replica.write(key, entry).await {
                    Ok(_) => successes += 1,
                    Err(e) => errors.push(e),
                }
            }
            if successes >= self.write_quorum {
                {
                    use ::tracing::__macro_support::Callsite as _;
                    static __CALLSITE: ::tracing::callsite::DefaultCallsite = {
                        static META: ::tracing::Metadata<'static> = {
                            ::tracing_core::metadata::Metadata::new(
                                "event wormgraph/src/replication.rs:174",
                                "arkhe_wormgraph::replication",
                                ::tracing::Level::DEBUG,
                                ::tracing_core::__macro_support::Option::Some(
                                    "wormgraph/src/replication.rs",
                                ),
                                ::tracing_core::__macro_support::Option::Some(174u32),
                                ::tracing_core::__macro_support::Option::Some(
                                    "arkhe_wormgraph::replication",
                                ),
                                ::tracing_core::field::FieldSet::new(
                                    &["message"],
                                    ::tracing_core::callsite::Identifier(&__CALLSITE),
                                ),
                                ::tracing::metadata::Kind::EVENT,
                            )
                        };
                        ::tracing::callsite::DefaultCallsite::new(&META)
                    };
                    let enabled = ::tracing::Level::DEBUG
                        <= ::tracing::level_filters::STATIC_MAX_LEVEL
                        && ::tracing::Level::DEBUG
                            <= ::tracing::level_filters::LevelFilter::current()
                        && {
                            let interest = __CALLSITE.interest();
                            !interest.is_never()
                                && ::tracing::__macro_support::__is_enabled(
                                    __CALLSITE.metadata(),
                                    interest,
                                )
                        };
                    if enabled {
                        (|value_set: ::tracing::field::ValueSet| {
                            let meta = __CALLSITE.metadata();
                            ::tracing::Event::dispatch(meta, &value_set);
                        })({
                            #[allow(unused_imports)]
                            use ::tracing::field::{debug, display, Value};
                            __CALLSITE
                                .metadata()
                                .fields()
                                .value_set_all(
                                    &[
                                        (::tracing::__macro_support::Option::Some(
                                            &format_args!(
                                                "Quorum de escrita atingido: {0}/{1}",
                                                successes,
                                                self.replicas.len(),
                                            ) as &dyn ::tracing::field::Value,
                                        )),
                                    ],
                                )
                        });
                    } else {
                    }
                };
                Ok(())
            } else {
                let err_msg = ::alloc::__export::must_use({
                    ::alloc::fmt::format(
                        format_args!(
                            "Quorum de escrita falhou: {0}/{1}",
                            successes,
                            self.replicas.len(),
                        ),
                    )
                });
                {
                    use ::tracing::__macro_support::Callsite as _;
                    static __CALLSITE: ::tracing::callsite::DefaultCallsite = {
                        static META: ::tracing::Metadata<'static> = {
                            ::tracing_core::metadata::Metadata::new(
                                "event wormgraph/src/replication.rs:178",
                                "arkhe_wormgraph::replication",
                                ::tracing::Level::ERROR,
                                ::tracing_core::__macro_support::Option::Some(
                                    "wormgraph/src/replication.rs",
                                ),
                                ::tracing_core::__macro_support::Option::Some(178u32),
                                ::tracing_core::__macro_support::Option::Some(
                                    "arkhe_wormgraph::replication",
                                ),
                                ::tracing_core::field::FieldSet::new(
                                    &["message"],
                                    ::tracing_core::callsite::Identifier(&__CALLSITE),
                                ),
                                ::tracing::metadata::Kind::EVENT,
                            )
                        };
                        ::tracing::callsite::DefaultCallsite::new(&META)
                    };
                    let enabled = ::tracing::Level::ERROR
                        <= ::tracing::level_filters::STATIC_MAX_LEVEL
                        && ::tracing::Level::ERROR
                            <= ::tracing::level_filters::LevelFilter::current()
                        && {
                            let interest = __CALLSITE.interest();
                            !interest.is_never()
                                && ::tracing::__macro_support::__is_enabled(
                                    __CALLSITE.metadata(),
                                    interest,
                                )
                        };
                    if enabled {
                        (|value_set: ::tracing::field::ValueSet| {
                            let meta = __CALLSITE.metadata();
                            ::tracing::Event::dispatch(meta, &value_set);
                        })({
                            #[allow(unused_imports)]
                            use ::tracing::field::{debug, display, Value};
                            __CALLSITE
                                .metadata()
                                .fields()
                                .value_set_all(
                                    &[
                                        (::tracing::__macro_support::Option::Some(
                                            &format_args!("{0}", err_msg)
                                                as &dyn ::tracing::field::Value,
                                        )),
                                    ],
                                )
                        });
                    } else {
                    }
                };
                Err(
                    ::anyhow::__private::must_use({
                        use ::anyhow::__private::kind::*;
                        let error = match err_msg {
                            error => (&error).anyhow_kind().new(error),
                        };
                        error
                    }),
                )
            }
        }
        pub async fn read_quorum(&self, key: &str) -> Result<Option<VersionedEntry<T>>> {
            let mut results = Vec::new();
            let mut errors = Vec::new();
            for replica in &self.replicas {
                match replica.read(key).await {
                    Ok(Some(entry)) => results.push(entry),
                    Ok(None) => {}
                    Err(e) => errors.push(e),
                }
            }
            if results.len() < self.read_quorum {
                let err_msg = ::alloc::__export::must_use({
                    ::alloc::fmt::format(
                        format_args!(
                            "Quorum de leitura falhou: {0}/{1}",
                            results.len(),
                            self.replicas.len(),
                        ),
                    )
                });
                {
                    use ::tracing::__macro_support::Callsite as _;
                    static __CALLSITE: ::tracing::callsite::DefaultCallsite = {
                        static META: ::tracing::Metadata<'static> = {
                            ::tracing_core::metadata::Metadata::new(
                                "event wormgraph/src/replication.rs:197",
                                "arkhe_wormgraph::replication",
                                ::tracing::Level::ERROR,
                                ::tracing_core::__macro_support::Option::Some(
                                    "wormgraph/src/replication.rs",
                                ),
                                ::tracing_core::__macro_support::Option::Some(197u32),
                                ::tracing_core::__macro_support::Option::Some(
                                    "arkhe_wormgraph::replication",
                                ),
                                ::tracing_core::field::FieldSet::new(
                                    &["message"],
                                    ::tracing_core::callsite::Identifier(&__CALLSITE),
                                ),
                                ::tracing::metadata::Kind::EVENT,
                            )
                        };
                        ::tracing::callsite::DefaultCallsite::new(&META)
                    };
                    let enabled = ::tracing::Level::ERROR
                        <= ::tracing::level_filters::STATIC_MAX_LEVEL
                        && ::tracing::Level::ERROR
                            <= ::tracing::level_filters::LevelFilter::current()
                        && {
                            let interest = __CALLSITE.interest();
                            !interest.is_never()
                                && ::tracing::__macro_support::__is_enabled(
                                    __CALLSITE.metadata(),
                                    interest,
                                )
                        };
                    if enabled {
                        (|value_set: ::tracing::field::ValueSet| {
                            let meta = __CALLSITE.metadata();
                            ::tracing::Event::dispatch(meta, &value_set);
                        })({
                            #[allow(unused_imports)]
                            use ::tracing::field::{debug, display, Value};
                            __CALLSITE
                                .metadata()
                                .fields()
                                .value_set_all(
                                    &[
                                        (::tracing::__macro_support::Option::Some(
                                            &format_args!("{0}", err_msg)
                                                as &dyn ::tracing::field::Value,
                                        )),
                                    ],
                                )
                        });
                    } else {
                    }
                };
                return Err(
                    ::anyhow::__private::must_use({
                        use ::anyhow::__private::kind::*;
                        let error = match err_msg {
                            error => (&error).anyhow_kind().new(error),
                        };
                        error
                    }),
                );
            }
            if results.is_empty() {
                return Ok(None);
            }
            let mut winner = results[0].clone();
            let mut conflict_detected = false;
            for entry in &results[1..] {
                let (merged, resolved) = ConflictResolver::resolve(&winner, entry);
                winner = merged;
                if !resolved {
                    conflict_detected = true;
                    {
                        use ::tracing::__macro_support::Callsite as _;
                        static __CALLSITE: ::tracing::callsite::DefaultCallsite = {
                            static META: ::tracing::Metadata<'static> = {
                                ::tracing_core::metadata::Metadata::new(
                                    "event wormgraph/src/replication.rs:213",
                                    "arkhe_wormgraph::replication",
                                    ::tracing::Level::WARN,
                                    ::tracing_core::__macro_support::Option::Some(
                                        "wormgraph/src/replication.rs",
                                    ),
                                    ::tracing_core::__macro_support::Option::Some(213u32),
                                    ::tracing_core::__macro_support::Option::Some(
                                        "arkhe_wormgraph::replication",
                                    ),
                                    ::tracing_core::field::FieldSet::new(
                                        &["message"],
                                        ::tracing_core::callsite::Identifier(&__CALLSITE),
                                    ),
                                    ::tracing::metadata::Kind::EVENT,
                                )
                            };
                            ::tracing::callsite::DefaultCallsite::new(&META)
                        };
                        let enabled = ::tracing::Level::WARN
                            <= ::tracing::level_filters::STATIC_MAX_LEVEL
                            && ::tracing::Level::WARN
                                <= ::tracing::level_filters::LevelFilter::current()
                            && {
                                let interest = __CALLSITE.interest();
                                !interest.is_never()
                                    && ::tracing::__macro_support::__is_enabled(
                                        __CALLSITE.metadata(),
                                        interest,
                                    )
                            };
                        if enabled {
                            (|value_set: ::tracing::field::ValueSet| {
                                let meta = __CALLSITE.metadata();
                                ::tracing::Event::dispatch(meta, &value_set);
                            })({
                                #[allow(unused_imports)]
                                use ::tracing::field::{debug, display, Value};
                                __CALLSITE
                                    .metadata()
                                    .fields()
                                    .value_set_all(
                                        &[
                                            (::tracing::__macro_support::Option::Some(
                                                &format_args!(
                                                    "Conflito detectado para chave {0}: resolvido com timestamp mais recente",
                                                    key,
                                                ) as &dyn ::tracing::field::Value,
                                            )),
                                        ],
                                    )
                            });
                        } else {
                        }
                    };
                }
            }
            for replica in &self.replicas {
                if let Ok(Some(current)) = replica.read(key).await {
                    if current.version != winner.version {
                        let _ = replica.write(key, &winner).await;
                    }
                } else {
                    let _ = replica.write(key, &winner).await;
                }
            }
            if conflict_detected {
                {
                    use ::tracing::__macro_support::Callsite as _;
                    static __CALLSITE: ::tracing::callsite::DefaultCallsite = {
                        static META: ::tracing::Metadata<'static> = {
                            ::tracing_core::metadata::Metadata::new(
                                "event wormgraph/src/replication.rs:228",
                                "arkhe_wormgraph::replication",
                                ::tracing::Level::WARN,
                                ::tracing_core::__macro_support::Option::Some(
                                    "wormgraph/src/replication.rs",
                                ),
                                ::tracing_core::__macro_support::Option::Some(228u32),
                                ::tracing_core::__macro_support::Option::Some(
                                    "arkhe_wormgraph::replication",
                                ),
                                ::tracing_core::field::FieldSet::new(
                                    &["message"],
                                    ::tracing_core::callsite::Identifier(&__CALLSITE),
                                ),
                                ::tracing::metadata::Kind::EVENT,
                            )
                        };
                        ::tracing::callsite::DefaultCallsite::new(&META)
                    };
                    let enabled = ::tracing::Level::WARN
                        <= ::tracing::level_filters::STATIC_MAX_LEVEL
                        && ::tracing::Level::WARN
                            <= ::tracing::level_filters::LevelFilter::current()
                        && {
                            let interest = __CALLSITE.interest();
                            !interest.is_never()
                                && ::tracing::__macro_support::__is_enabled(
                                    __CALLSITE.metadata(),
                                    interest,
                                )
                        };
                    if enabled {
                        (|value_set: ::tracing::field::ValueSet| {
                            let meta = __CALLSITE.metadata();
                            ::tracing::Event::dispatch(meta, &value_set);
                        })({
                            #[allow(unused_imports)]
                            use ::tracing::field::{debug, display, Value};
                            __CALLSITE
                                .metadata()
                                .fields()
                                .value_set_all(
                                    &[
                                        (::tracing::__macro_support::Option::Some(
                                            &format_args!(
                                                "Conflito resolvido para chave {0} com vetor {1:?}",
                                                key,
                                                winner.version,
                                            ) as &dyn ::tracing::field::Value,
                                        )),
                                    ],
                                )
                        });
                    } else {
                    }
                };
            }
            Ok(Some(winner))
        }
    }
    pub struct MemoryReplicaStorage<T> {
        node_id: NodeId,
        data: Arc<RwLock<HashMap<String, VersionedEntry<T>>>>,
    }
    impl<T: Clone + Send + Sync + 'static> MemoryReplicaStorage<T> {
        pub fn new(node_id: NodeId) -> Self {
            Self {
                node_id,
                data: Arc::new(RwLock::new(HashMap::new())),
            }
        }
    }
    impl<T: Clone + Send + Sync + 'static> ReplicaStorage<T>
    for MemoryReplicaStorage<T> {
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn read<'life0, 'life1, 'async_trait>(
            &'life0 self,
            key: &'life1 str,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<Option<VersionedEntry<T>>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<Option<VersionedEntry<T>>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let __ret: Result<Option<VersionedEntry<T>>> = {
                    let data = __self.data.read().await;
                    Ok(data.get(key).cloned())
                };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn write<'life0, 'life1, 'life2, 'async_trait>(
            &'life0 self,
            key: &'life1 str,
            entry: &'life2 VersionedEntry<T>,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<()>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            'life1: 'async_trait,
            'life2: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<()>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let __ret: Result<()> = {
                    let mut data = __self.data.write().await;
                    data.insert(key.to_string(), entry.clone());
                    Ok(())
                };
                #[allow(unreachable_code)] __ret
            })
        }
        #[allow(
            elided_named_lifetimes,
            clippy::async_yields_async,
            clippy::diverging_sub_expression,
            clippy::let_unit_value,
            clippy::needless_arbitrary_self_type,
            clippy::no_effect_underscore_binding,
            clippy::shadow_same,
            clippy::type_complexity,
            clippy::type_repetition_in_bounds,
            clippy::used_underscore_binding
        )]
        fn read_all<'life0, 'async_trait>(
            &'life0 self,
        ) -> ::core::pin::Pin<
            Box<
                dyn ::core::future::Future<
                    Output = Result<HashMap<String, VersionedEntry<T>>>,
                > + ::core::marker::Send + 'async_trait,
            >,
        >
        where
            'life0: 'async_trait,
            Self: 'async_trait,
        {
            Box::pin(async move {
                if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                    Result<HashMap<String, VersionedEntry<T>>>,
                > {
                    #[allow(unreachable_code)] return __ret;
                }
                let __self = self;
                let __ret: Result<HashMap<String, VersionedEntry<T>>> = {
                    let data = __self.data.read().await;
                    Ok(data.clone())
                };
                #[allow(unreachable_code)] __ret
            })
        }
    }
}
pub mod reputation {
    pub struct ReputationManager {
        wormgraph: std::sync::Arc<crate::WormGraphClient>,
    }
    impl ReputationManager {
        pub fn new(wormgraph: std::sync::Arc<crate::WormGraphClient>) -> Self {
            Self { wormgraph }
        }
        pub async fn update_reputation(&self, _agent_id: &str) -> anyhow::Result<()> {
            Ok(())
        }
        pub async fn get_reputation_with_proof(
            &self,
            _agent_id: &str,
        ) -> anyhow::Result<(f64, MerkleProof)> {
            Ok((1.0, MerkleProof {}))
        }
        pub async fn verify_merkle_proof(
            &self,
            _proof: &MerkleProof,
        ) -> anyhow::Result<bool> {
            Ok(true)
        }
        pub async fn generate_zk_reputation_proof(
            &self,
            _agent_id: &str,
        ) -> anyhow::Result<ZkReputationProof> {
            Ok(ZkReputationProof {})
        }
        pub async fn verify_zk_reputation_proof(
            &self,
            _proof: &ZkReputationProof,
            _agent_id: &str,
        ) -> anyhow::Result<bool> {
            Ok(true)
        }
    }
    pub struct ReputationMerkleTree {
        pub root_hash: [u64; 4],
    }
    impl ReputationMerkleTree {
        pub fn new() -> Self {
            Self { root_hash: [0; 4] }
        }
        pub fn upsert(&mut self, _agent_id: &str, _score: u64) {}
        pub fn generate_proof(
            &self,
            _agent_id: &str,
        ) -> anyhow::Result<MerkleProofData> {
            Ok(MerkleProofData {
                score: 1,
                root_hash: self.root_hash,
            })
        }
        pub fn verify_proof(&self, _proof: &MerkleProofData) -> anyhow::Result<bool> {
            Ok(true)
        }
    }
    pub struct MerkleProof {}
    pub struct ZkReputationProof {}
    pub struct MerkleProofData {
        pub score: u64,
        pub root_hash: [u64; 4],
    }
}
pub mod test_utils {
    pub mod fault_injection {
        use crate::replication::{ReplicaStorage, VersionedEntry};
        use anyhow::Result;
        use async_trait::async_trait;
        use std::collections::HashMap;
        use std::sync::Arc;
        use std::time::Duration;
        pub enum FaultType {
            Timeout,
            NetworkError,
            DataCorruption,
            Latency(Duration),
            Partition { peers_visible: () },
        }
        #[automatically_derived]
        impl ::core::fmt::Debug for FaultType {
            #[inline]
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                match self {
                    FaultType::Timeout => ::core::fmt::Formatter::write_str(f, "Timeout"),
                    FaultType::NetworkError => {
                        ::core::fmt::Formatter::write_str(f, "NetworkError")
                    }
                    FaultType::DataCorruption => {
                        ::core::fmt::Formatter::write_str(f, "DataCorruption")
                    }
                    FaultType::Latency(__self_0) => {
                        ::core::fmt::Formatter::debug_tuple_field1_finish(
                            f,
                            "Latency",
                            &__self_0,
                        )
                    }
                    FaultType::Partition { peers_visible: __self_0 } => {
                        ::core::fmt::Formatter::debug_struct_field1_finish(
                            f,
                            "Partition",
                            "peers_visible",
                            &__self_0,
                        )
                    }
                }
            }
        }
        #[automatically_derived]
        #[doc(hidden)]
        unsafe impl ::core::clone::TrivialClone for FaultType {}
        #[automatically_derived]
        impl ::core::clone::Clone for FaultType {
            #[inline]
            fn clone(&self) -> FaultType {
                let _: ::core::clone::AssertParamIsClone<Duration>;
                let _: ::core::clone::AssertParamIsClone<()>;
                *self
            }
        }
        #[automatically_derived]
        impl ::core::marker::Copy for FaultType {}
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for FaultType {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for FaultType {
            #[inline]
            fn eq(&self, other: &FaultType) -> bool {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                __self_discr == __arg1_discr
                    && match (self, other) {
                        (FaultType::Latency(__self_0), FaultType::Latency(__arg1_0)) => {
                            __self_0 == __arg1_0
                        }
                        (
                            FaultType::Partition { peers_visible: __self_0 },
                            FaultType::Partition { peers_visible: __arg1_0 },
                        ) => __self_0 == __arg1_0,
                        _ => true,
                    }
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Eq for FaultType {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_receiver_is_total_eq(&self) -> () {
                let _: ::core::cmp::AssertParamIsEq<Duration>;
                let _: ::core::cmp::AssertParamIsEq<()>;
            }
        }
        pub struct FaultyReplicaStorage<T> {
            inner: Arc<dyn ReplicaStorage<T>>,
            node_id: String,
            fault_rate: f64,
            fault_type: FaultType,
        }
        impl<T: Clone + Send + Sync + 'static> FaultyReplicaStorage<T> {
            pub fn new(
                inner: Arc<dyn ReplicaStorage<T>>,
                node_id: &str,
                fault_rate: f64,
                fault_type: FaultType,
            ) -> Self {
                Self {
                    inner,
                    node_id: node_id.to_string(),
                    fault_rate,
                    fault_type,
                }
            }
        }
        impl<T: Clone + Send + Sync + 'static> ReplicaStorage<T>
        for FaultyReplicaStorage<T> {
            #[allow(
                elided_named_lifetimes,
                clippy::async_yields_async,
                clippy::diverging_sub_expression,
                clippy::let_unit_value,
                clippy::needless_arbitrary_self_type,
                clippy::no_effect_underscore_binding,
                clippy::shadow_same,
                clippy::type_complexity,
                clippy::type_repetition_in_bounds,
                clippy::used_underscore_binding
            )]
            fn read<'life0, 'life1, 'async_trait>(
                &'life0 self,
                key: &'life1 str,
            ) -> ::core::pin::Pin<
                Box<
                    dyn ::core::future::Future<
                        Output = Result<Option<VersionedEntry<T>>>,
                    > + ::core::marker::Send + 'async_trait,
                >,
            >
            where
                'life0: 'async_trait,
                'life1: 'async_trait,
                Self: 'async_trait,
            {
                Box::pin(async move {
                    if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                        Result<Option<VersionedEntry<T>>>,
                    > {
                        #[allow(unreachable_code)] return __ret;
                    }
                    let __self = self;
                    let __ret: Result<Option<VersionedEntry<T>>> = {
                        __self.inner.read(key).await
                    };
                    #[allow(unreachable_code)] __ret
                })
            }
            #[allow(
                elided_named_lifetimes,
                clippy::async_yields_async,
                clippy::diverging_sub_expression,
                clippy::let_unit_value,
                clippy::needless_arbitrary_self_type,
                clippy::no_effect_underscore_binding,
                clippy::shadow_same,
                clippy::type_complexity,
                clippy::type_repetition_in_bounds,
                clippy::used_underscore_binding
            )]
            fn write<'life0, 'life1, 'life2, 'async_trait>(
                &'life0 self,
                key: &'life1 str,
                entry: &'life2 VersionedEntry<T>,
            ) -> ::core::pin::Pin<
                Box<
                    dyn ::core::future::Future<
                        Output = Result<()>,
                    > + ::core::marker::Send + 'async_trait,
                >,
            >
            where
                'life0: 'async_trait,
                'life1: 'async_trait,
                'life2: 'async_trait,
                Self: 'async_trait,
            {
                Box::pin(async move {
                    if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                        Result<()>,
                    > {
                        #[allow(unreachable_code)] return __ret;
                    }
                    let __self = self;
                    let __ret: Result<()> = { __self.inner.write(key, entry).await };
                    #[allow(unreachable_code)] __ret
                })
            }
            #[allow(
                elided_named_lifetimes,
                clippy::async_yields_async,
                clippy::diverging_sub_expression,
                clippy::let_unit_value,
                clippy::needless_arbitrary_self_type,
                clippy::no_effect_underscore_binding,
                clippy::shadow_same,
                clippy::type_complexity,
                clippy::type_repetition_in_bounds,
                clippy::used_underscore_binding
            )]
            fn read_all<'life0, 'async_trait>(
                &'life0 self,
            ) -> ::core::pin::Pin<
                Box<
                    dyn ::core::future::Future<
                        Output = Result<HashMap<String, VersionedEntry<T>>>,
                    > + ::core::marker::Send + 'async_trait,
                >,
            >
            where
                'life0: 'async_trait,
                Self: 'async_trait,
            {
                Box::pin(async move {
                    if let ::core::option::Option::Some(__ret) = ::core::option::Option::None::<
                        Result<HashMap<String, VersionedEntry<T>>>,
                    > {
                        #[allow(unreachable_code)] return __ret;
                    }
                    let __self = self;
                    let __ret: Result<HashMap<String, VersionedEntry<T>>> = {
                        __self.inner.read_all().await
                    };
                    #[allow(unreachable_code)] __ret
                })
            }
        }
    }
}
pub use shard::{WormGraphShard, ProvenanceEvent, EventType, Filter};
pub use storage_file::{HardenedFileStorage, FileStorageConfig};
pub use shard_manager::ShardManager;
pub use storage::{ShardStorage, ShardMetadata};
pub use client::WormGraphClient;
pub mod client {
    use super::*;
    use std::sync::Arc;
    use crate::shard::ProvenanceEvent;
    pub struct WormGraphClient {
        storage: Arc<dyn ShardStorage>,
    }
    impl WormGraphClient {
        pub fn new_with_storage(storage: Arc<dyn ShardStorage>) -> Self {
            Self { storage }
        }
        pub async fn append_event(
            &self,
            _event: cathedral::v1::Event,
        ) -> anyhow::Result<ProvenanceEvent> {
            ::core::panicking::panic("not implemented")
        }
        pub async fn query(
            &self,
            _project_id: Option<&str>,
            _design_hash: Option<&str>,
            _agent_id: Option<&str>,
            _tree_id: Option<&str>,
            _limit: usize,
        ) -> anyhow::Result<Vec<ProvenanceEvent>> {
            ::core::panicking::panic("not implemented")
        }
    }
}
pub mod cathedral {
    pub mod v1 {
        pub struct AgentIdentity {
            #[prost(string, tag = "1")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(string, optional, tag = "2")]
            pub parent_agent_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(string, optional, tag = "3")]
            pub tree_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(string, repeated, tag = "4")]
            pub subagent_ids: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
            #[prost(string, tag = "5")]
            pub role: ::prost::alloc::string::String,
            #[prost(uint32, tag = "6")]
            pub depth: u32,
            #[prost(string, optional, tag = "7")]
            pub reputation_hash: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(map = "string, string", tag = "8")]
            pub metadata: ::std::collections::HashMap<
                ::prost::alloc::string::String,
                ::prost::alloc::string::String,
            >,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for AgentIdentity {
            #[inline]
            fn clone(&self) -> AgentIdentity {
                AgentIdentity {
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    parent_agent_id: ::core::clone::Clone::clone(&self.parent_agent_id),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                    subagent_ids: ::core::clone::Clone::clone(&self.subagent_ids),
                    role: ::core::clone::Clone::clone(&self.role),
                    depth: ::core::clone::Clone::clone(&self.depth),
                    reputation_hash: ::core::clone::Clone::clone(&self.reputation_hash),
                    metadata: ::core::clone::Clone::clone(&self.metadata),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for AgentIdentity {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for AgentIdentity {
            #[inline]
            fn eq(&self, other: &AgentIdentity) -> bool {
                self.depth == other.depth && self.agent_id == other.agent_id
                    && self.parent_agent_id == other.parent_agent_id
                    && self.tree_id == other.tree_id
                    && self.subagent_ids == other.subagent_ids && self.role == other.role
                    && self.reputation_hash == other.reputation_hash
                    && self.metadata == other.metadata
            }
        }
        pub struct CreateAgentRequest {
            #[prost(string, tag = "1")]
            pub parent_agent_id: ::prost::alloc::string::String,
            #[prost(string, tag = "2")]
            pub new_agent_id: ::prost::alloc::string::String,
            #[prost(string, tag = "3")]
            pub role: ::prost::alloc::string::String,
            #[prost(map = "string, string", tag = "4")]
            pub config: ::std::collections::HashMap<
                ::prost::alloc::string::String,
                ::prost::alloc::string::String,
            >,
            #[prost(string, optional, tag = "5")]
            pub tree_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(bool, tag = "6")]
            pub recursive: bool,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for CreateAgentRequest {
            #[inline]
            fn clone(&self) -> CreateAgentRequest {
                CreateAgentRequest {
                    parent_agent_id: ::core::clone::Clone::clone(&self.parent_agent_id),
                    new_agent_id: ::core::clone::Clone::clone(&self.new_agent_id),
                    role: ::core::clone::Clone::clone(&self.role),
                    config: ::core::clone::Clone::clone(&self.config),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                    recursive: ::core::clone::Clone::clone(&self.recursive),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for CreateAgentRequest {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for CreateAgentRequest {
            #[inline]
            fn eq(&self, other: &CreateAgentRequest) -> bool {
                self.recursive == other.recursive
                    && self.parent_agent_id == other.parent_agent_id
                    && self.new_agent_id == other.new_agent_id && self.role == other.role
                    && self.config == other.config && self.tree_id == other.tree_id
            }
        }
        pub struct CreateAgentResponse {
            #[prost(bool, tag = "1")]
            pub success: bool,
            #[prost(string, tag = "2")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(string, tag = "3")]
            pub tree_id: ::prost::alloc::string::String,
            #[prost(string, tag = "4")]
            pub message: ::prost::alloc::string::String,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for CreateAgentResponse {
            #[inline]
            fn clone(&self) -> CreateAgentResponse {
                CreateAgentResponse {
                    success: ::core::clone::Clone::clone(&self.success),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                    message: ::core::clone::Clone::clone(&self.message),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for CreateAgentResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for CreateAgentResponse {
            #[inline]
            fn eq(&self, other: &CreateAgentResponse) -> bool {
                self.success == other.success && self.agent_id == other.agent_id
                    && self.tree_id == other.tree_id && self.message == other.message
            }
        }
        pub struct AgentSelfMutation {
            #[prost(string, tag = "1")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(string, tag = "2")]
            pub mutation_type: ::prost::alloc::string::String,
            #[prost(string, optional, tag = "3")]
            pub new_role: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(map = "string, string", tag = "4")]
            pub new_config: ::std::collections::HashMap<
                ::prost::alloc::string::String,
                ::prost::alloc::string::String,
            >,
            #[prost(string, optional, tag = "5")]
            pub patch: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(bool, tag = "6")]
            pub recursive_to_subagents: bool,
            #[prost(string, optional, tag = "7")]
            pub tree_id: ::core::option::Option<::prost::alloc::string::String>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for AgentSelfMutation {
            #[inline]
            fn clone(&self) -> AgentSelfMutation {
                AgentSelfMutation {
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    mutation_type: ::core::clone::Clone::clone(&self.mutation_type),
                    new_role: ::core::clone::Clone::clone(&self.new_role),
                    new_config: ::core::clone::Clone::clone(&self.new_config),
                    patch: ::core::clone::Clone::clone(&self.patch),
                    recursive_to_subagents: ::core::clone::Clone::clone(
                        &self.recursive_to_subagents,
                    ),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for AgentSelfMutation {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for AgentSelfMutation {
            #[inline]
            fn eq(&self, other: &AgentSelfMutation) -> bool {
                self.recursive_to_subagents == other.recursive_to_subagents
                    && self.agent_id == other.agent_id
                    && self.mutation_type == other.mutation_type
                    && self.new_role == other.new_role
                    && self.new_config == other.new_config && self.patch == other.patch
                    && self.tree_id == other.tree_id
            }
        }
        pub struct MutateAgentResponse {
            #[prost(bool, tag = "1")]
            pub success: bool,
            #[prost(string, tag = "2")]
            pub message: ::prost::alloc::string::String,
            #[prost(uint32, tag = "3")]
            pub affected_agents: u32,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for MutateAgentResponse {
            #[inline]
            fn clone(&self) -> MutateAgentResponse {
                MutateAgentResponse {
                    success: ::core::clone::Clone::clone(&self.success),
                    message: ::core::clone::Clone::clone(&self.message),
                    affected_agents: ::core::clone::Clone::clone(&self.affected_agents),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for MutateAgentResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for MutateAgentResponse {
            #[inline]
            fn eq(&self, other: &MutateAgentResponse) -> bool {
                self.success == other.success
                    && self.affected_agents == other.affected_agents
                    && self.message == other.message
            }
        }
        pub struct IngestRequest {
            #[prost(string, tag = "1")]
            pub project_id: ::prost::alloc::string::String,
            #[prost(string, tag = "2")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(message, repeated, tag = "3")]
            pub events: ::prost::alloc::vec::Vec<Event>,
            #[prost(string, optional, tag = "4")]
            pub batch_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(bytes = "vec", optional, tag = "5")]
            pub agent_signature: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
            #[prost(bytes = "vec", optional, tag = "6")]
            pub batch_hash: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
            #[prost(message, optional, tag = "7")]
            pub agent_identity: ::core::option::Option<AgentIdentity>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for IngestRequest {
            #[inline]
            fn clone(&self) -> IngestRequest {
                IngestRequest {
                    project_id: ::core::clone::Clone::clone(&self.project_id),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    events: ::core::clone::Clone::clone(&self.events),
                    batch_id: ::core::clone::Clone::clone(&self.batch_id),
                    agent_signature: ::core::clone::Clone::clone(&self.agent_signature),
                    batch_hash: ::core::clone::Clone::clone(&self.batch_hash),
                    agent_identity: ::core::clone::Clone::clone(&self.agent_identity),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for IngestRequest {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for IngestRequest {
            #[inline]
            fn eq(&self, other: &IngestRequest) -> bool {
                self.project_id == other.project_id && self.agent_id == other.agent_id
                    && self.events == other.events && self.batch_id == other.batch_id
                    && self.agent_signature == other.agent_signature
                    && self.batch_hash == other.batch_hash
                    && self.agent_identity == other.agent_identity
            }
        }
        pub struct IngestResponse {
            #[prost(bool, tag = "1")]
            pub success: bool,
            #[prost(string, tag = "2")]
            pub message: ::prost::alloc::string::String,
            #[prost(uint32, tag = "3")]
            pub events_accepted: u32,
            #[prost(string, repeated, tag = "4")]
            pub rejected_event_ids: ::prost::alloc::vec::Vec<
                ::prost::alloc::string::String,
            >,
            #[prost(string, tag = "5")]
            pub bridge_timestamp: ::prost::alloc::string::String,
            #[prost(bytes = "vec", optional, tag = "6")]
            pub merkle_root: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
            #[prost(bytes = "vec", optional, tag = "7")]
            pub tree_provenance_hash: ::core::option::Option<
                ::prost::alloc::vec::Vec<u8>,
            >,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for IngestResponse {
            #[inline]
            fn clone(&self) -> IngestResponse {
                IngestResponse {
                    success: ::core::clone::Clone::clone(&self.success),
                    message: ::core::clone::Clone::clone(&self.message),
                    events_accepted: ::core::clone::Clone::clone(&self.events_accepted),
                    rejected_event_ids: ::core::clone::Clone::clone(
                        &self.rejected_event_ids,
                    ),
                    bridge_timestamp: ::core::clone::Clone::clone(
                        &self.bridge_timestamp,
                    ),
                    merkle_root: ::core::clone::Clone::clone(&self.merkle_root),
                    tree_provenance_hash: ::core::clone::Clone::clone(
                        &self.tree_provenance_hash,
                    ),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for IngestResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for IngestResponse {
            #[inline]
            fn eq(&self, other: &IngestResponse) -> bool {
                self.success == other.success
                    && self.events_accepted == other.events_accepted
                    && self.message == other.message
                    && self.rejected_event_ids == other.rejected_event_ids
                    && self.bridge_timestamp == other.bridge_timestamp
                    && self.merkle_root == other.merkle_root
                    && self.tree_provenance_hash == other.tree_provenance_hash
            }
        }
        pub struct Event {
            #[prost(string, tag = "1")]
            pub event_id: ::prost::alloc::string::String,
            #[prost(message, optional, tag = "2")]
            pub timestamp: ::core::option::Option<::prost_types::Timestamp>,
            #[prost(enumeration = "EventType", tag = "3")]
            pub event_type: i32,
            #[prost(string, tag = "4")]
            pub design_hash: ::prost::alloc::string::String,
            #[prost(string, repeated, tag = "5")]
            pub parent_hashes: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
            #[prost(string, tag = "6")]
            pub payload_json: ::prost::alloc::string::String,
            #[prost(message, optional, tag = "7")]
            pub metadata: ::core::option::Option<EventMetadata>,
            #[prost(message, optional, tag = "8")]
            pub zk_proof: ::core::option::Option<ZkProofRef>,
            #[prost(message, optional, tag = "9")]
            pub agent_identity: ::core::option::Option<AgentIdentity>,
            #[prost(bytes = "vec", optional, tag = "10")]
            pub agent_signature: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for Event {
            #[inline]
            fn clone(&self) -> Event {
                Event {
                    event_id: ::core::clone::Clone::clone(&self.event_id),
                    timestamp: ::core::clone::Clone::clone(&self.timestamp),
                    event_type: ::core::clone::Clone::clone(&self.event_type),
                    design_hash: ::core::clone::Clone::clone(&self.design_hash),
                    parent_hashes: ::core::clone::Clone::clone(&self.parent_hashes),
                    payload_json: ::core::clone::Clone::clone(&self.payload_json),
                    metadata: ::core::clone::Clone::clone(&self.metadata),
                    zk_proof: ::core::clone::Clone::clone(&self.zk_proof),
                    agent_identity: ::core::clone::Clone::clone(&self.agent_identity),
                    agent_signature: ::core::clone::Clone::clone(&self.agent_signature),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for Event {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for Event {
            #[inline]
            fn eq(&self, other: &Event) -> bool {
                self.event_type == other.event_type && self.event_id == other.event_id
                    && self.timestamp == other.timestamp
                    && self.design_hash == other.design_hash
                    && self.parent_hashes == other.parent_hashes
                    && self.payload_json == other.payload_json
                    && self.metadata == other.metadata && self.zk_proof == other.zk_proof
                    && self.agent_identity == other.agent_identity
                    && self.agent_signature == other.agent_signature
            }
        }
        pub struct EventMetadata {
            #[prost(string, tag = "1")]
            pub domain: ::prost::alloc::string::String,
            #[prost(double, tag = "2")]
            pub confidence: f64,
            #[prost(double, tag = "3")]
            pub compute_cost_usd: f64,
            #[prost(string, repeated, tag = "4")]
            pub tags: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for EventMetadata {
            #[inline]
            fn clone(&self) -> EventMetadata {
                EventMetadata {
                    domain: ::core::clone::Clone::clone(&self.domain),
                    confidence: ::core::clone::Clone::clone(&self.confidence),
                    compute_cost_usd: ::core::clone::Clone::clone(
                        &self.compute_cost_usd,
                    ),
                    tags: ::core::clone::Clone::clone(&self.tags),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for EventMetadata {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for EventMetadata {
            #[inline]
            fn eq(&self, other: &EventMetadata) -> bool {
                self.confidence == other.confidence
                    && self.compute_cost_usd == other.compute_cost_usd
                    && self.domain == other.domain && self.tags == other.tags
            }
        }
        pub struct ZkProofRef {
            #[prost(string, tag = "1")]
            pub circuit_id: ::prost::alloc::string::String,
            #[prost(bytes = "vec", tag = "2")]
            pub proof_hash: ::prost::alloc::vec::Vec<u8>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for ZkProofRef {
            #[inline]
            fn clone(&self) -> ZkProofRef {
                ZkProofRef {
                    circuit_id: ::core::clone::Clone::clone(&self.circuit_id),
                    proof_hash: ::core::clone::Clone::clone(&self.proof_hash),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for ZkProofRef {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for ZkProofRef {
            #[inline]
            fn eq(&self, other: &ZkProofRef) -> bool {
                self.circuit_id == other.circuit_id
                    && self.proof_hash == other.proof_hash
            }
        }
        pub struct GovernanceRequest {
            #[prost(string, tag = "1")]
            pub request_id: ::prost::alloc::string::String,
            #[prost(string, tag = "2")]
            pub project_id: ::prost::alloc::string::String,
            #[prost(string, tag = "3")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(enumeration = "EventType", tag = "4")]
            pub event_type: i32,
            #[prost(string, tag = "5")]
            pub proposed_state_json: ::prost::alloc::string::String,
            #[prost(string, tag = "6")]
            pub current_state_json: ::prost::alloc::string::String,
            #[prost(double, tag = "7")]
            pub agent_risk_score: f64,
            #[prost(string, optional, tag = "8")]
            pub domain: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(map = "string, string", tag = "9")]
            pub metadata: ::std::collections::HashMap<
                ::prost::alloc::string::String,
                ::prost::alloc::string::String,
            >,
            #[prost(message, optional, tag = "10")]
            pub agent_identity: ::core::option::Option<AgentIdentity>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for GovernanceRequest {
            #[inline]
            fn clone(&self) -> GovernanceRequest {
                GovernanceRequest {
                    request_id: ::core::clone::Clone::clone(&self.request_id),
                    project_id: ::core::clone::Clone::clone(&self.project_id),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    event_type: ::core::clone::Clone::clone(&self.event_type),
                    proposed_state_json: ::core::clone::Clone::clone(
                        &self.proposed_state_json,
                    ),
                    current_state_json: ::core::clone::Clone::clone(
                        &self.current_state_json,
                    ),
                    agent_risk_score: ::core::clone::Clone::clone(
                        &self.agent_risk_score,
                    ),
                    domain: ::core::clone::Clone::clone(&self.domain),
                    metadata: ::core::clone::Clone::clone(&self.metadata),
                    agent_identity: ::core::clone::Clone::clone(&self.agent_identity),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for GovernanceRequest {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for GovernanceRequest {
            #[inline]
            fn eq(&self, other: &GovernanceRequest) -> bool {
                self.event_type == other.event_type
                    && self.agent_risk_score == other.agent_risk_score
                    && self.request_id == other.request_id
                    && self.project_id == other.project_id
                    && self.agent_id == other.agent_id
                    && self.proposed_state_json == other.proposed_state_json
                    && self.current_state_json == other.current_state_json
                    && self.domain == other.domain && self.metadata == other.metadata
                    && self.agent_identity == other.agent_identity
            }
        }
        pub struct GovernanceResponse {
            #[prost(string, tag = "1")]
            pub request_id: ::prost::alloc::string::String,
            #[prost(enumeration = "GovernanceVerdict", tag = "2")]
            pub verdict: i32,
            #[prost(string, tag = "3")]
            pub rationale: ::prost::alloc::string::String,
            #[prost(string, repeated, tag = "4")]
            pub conditions: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
            #[prost(string, tag = "5")]
            pub evaluated_by: ::prost::alloc::string::String,
            #[prost(message, optional, tag = "6")]
            pub evaluated_at: ::core::option::Option<::prost_types::Timestamp>,
            #[prost(bytes = "vec", tag = "7")]
            pub decision_hash: ::prost::alloc::vec::Vec<u8>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for GovernanceResponse {
            #[inline]
            fn clone(&self) -> GovernanceResponse {
                GovernanceResponse {
                    request_id: ::core::clone::Clone::clone(&self.request_id),
                    verdict: ::core::clone::Clone::clone(&self.verdict),
                    rationale: ::core::clone::Clone::clone(&self.rationale),
                    conditions: ::core::clone::Clone::clone(&self.conditions),
                    evaluated_by: ::core::clone::Clone::clone(&self.evaluated_by),
                    evaluated_at: ::core::clone::Clone::clone(&self.evaluated_at),
                    decision_hash: ::core::clone::Clone::clone(&self.decision_hash),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for GovernanceResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for GovernanceResponse {
            #[inline]
            fn eq(&self, other: &GovernanceResponse) -> bool {
                self.verdict == other.verdict && self.request_id == other.request_id
                    && self.rationale == other.rationale
                    && self.conditions == other.conditions
                    && self.evaluated_by == other.evaluated_by
                    && self.evaluated_at == other.evaluated_at
                    && self.decision_hash == other.decision_hash
            }
        }
        pub struct QueryProvenanceRequest {
            #[prost(string, tag = "1")]
            pub project_id: ::prost::alloc::string::String,
            #[prost(string, optional, tag = "2")]
            pub design_hash: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(string, optional, tag = "3")]
            pub agent_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(string, optional, tag = "4")]
            pub tree_id: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(uint32, tag = "5")]
            pub limit: u32,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for QueryProvenanceRequest {
            #[inline]
            fn clone(&self) -> QueryProvenanceRequest {
                QueryProvenanceRequest {
                    project_id: ::core::clone::Clone::clone(&self.project_id),
                    design_hash: ::core::clone::Clone::clone(&self.design_hash),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                    limit: ::core::clone::Clone::clone(&self.limit),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for QueryProvenanceRequest {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for QueryProvenanceRequest {
            #[inline]
            fn eq(&self, other: &QueryProvenanceRequest) -> bool {
                self.limit == other.limit && self.project_id == other.project_id
                    && self.design_hash == other.design_hash
                    && self.agent_id == other.agent_id && self.tree_id == other.tree_id
            }
        }
        pub struct QueryProvenanceResponse {
            #[prost(message, repeated, tag = "1")]
            pub entries: ::prost::alloc::vec::Vec<ProvenanceEntry>,
            #[prost(bool, tag = "2")]
            pub has_more: bool,
            #[prost(uint64, tag = "3")]
            pub total_count: u64,
            #[prost(string, repeated, tag = "4")]
            pub nostr_event_ids: ::prost::alloc::vec::Vec<
                ::prost::alloc::string::String,
            >,
            #[prost(string, optional, tag = "5")]
            pub tree_snapshot: ::core::option::Option<::prost::alloc::string::String>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for QueryProvenanceResponse {
            #[inline]
            fn clone(&self) -> QueryProvenanceResponse {
                QueryProvenanceResponse {
                    entries: ::core::clone::Clone::clone(&self.entries),
                    has_more: ::core::clone::Clone::clone(&self.has_more),
                    total_count: ::core::clone::Clone::clone(&self.total_count),
                    nostr_event_ids: ::core::clone::Clone::clone(&self.nostr_event_ids),
                    tree_snapshot: ::core::clone::Clone::clone(&self.tree_snapshot),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for QueryProvenanceResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for QueryProvenanceResponse {
            #[inline]
            fn eq(&self, other: &QueryProvenanceResponse) -> bool {
                self.has_more == other.has_more && self.total_count == other.total_count
                    && self.entries == other.entries
                    && self.nostr_event_ids == other.nostr_event_ids
                    && self.tree_snapshot == other.tree_snapshot
            }
        }
        pub struct ProvenanceEntry {
            #[prost(string, tag = "1")]
            pub id: ::prost::alloc::string::String,
            #[prost(uint64, tag = "2")]
            pub version: u64,
            #[prost(string, tag = "3")]
            pub decision_type: ::prost::alloc::string::String,
            #[prost(string, tag = "4")]
            pub before_state_json: ::prost::alloc::string::String,
            #[prost(string, tag = "5")]
            pub after_state_json: ::prost::alloc::string::String,
            #[prost(string, optional, tag = "6")]
            pub rationale: ::core::option::Option<::prost::alloc::string::String>,
            #[prost(message, optional, tag = "7")]
            pub timestamp: ::core::option::Option<::prost_types::Timestamp>,
            #[prost(string, tag = "8")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(message, optional, tag = "9")]
            pub agent_identity: ::core::option::Option<AgentIdentity>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for ProvenanceEntry {
            #[inline]
            fn clone(&self) -> ProvenanceEntry {
                ProvenanceEntry {
                    id: ::core::clone::Clone::clone(&self.id),
                    version: ::core::clone::Clone::clone(&self.version),
                    decision_type: ::core::clone::Clone::clone(&self.decision_type),
                    before_state_json: ::core::clone::Clone::clone(
                        &self.before_state_json,
                    ),
                    after_state_json: ::core::clone::Clone::clone(
                        &self.after_state_json,
                    ),
                    rationale: ::core::clone::Clone::clone(&self.rationale),
                    timestamp: ::core::clone::Clone::clone(&self.timestamp),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    agent_identity: ::core::clone::Clone::clone(&self.agent_identity),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for ProvenanceEntry {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for ProvenanceEntry {
            #[inline]
            fn eq(&self, other: &ProvenanceEntry) -> bool {
                self.version == other.version && self.id == other.id
                    && self.decision_type == other.decision_type
                    && self.before_state_json == other.before_state_json
                    && self.after_state_json == other.after_state_json
                    && self.rationale == other.rationale
                    && self.timestamp == other.timestamp
                    && self.agent_id == other.agent_id
                    && self.agent_identity == other.agent_identity
            }
        }
        pub struct MetaGovernanceRequest {
            #[prost(string, tag = "1")]
            pub request_id: ::prost::alloc::string::String,
            #[prost(string, tag = "2")]
            pub agent_id: ::prost::alloc::string::String,
            #[prost(string, tag = "3")]
            pub tree_id: ::prost::alloc::string::String,
            #[prost(string, tag = "4")]
            pub action: ::prost::alloc::string::String,
            #[prost(string, tag = "5")]
            pub rationale: ::prost::alloc::string::String,
            #[prost(double, tag = "6")]
            pub risk_score: f64,
            #[prost(string, repeated, tag = "7")]
            pub affected_agent_ids: ::prost::alloc::vec::Vec<
                ::prost::alloc::string::String,
            >,
            #[prost(bytes = "vec", optional, tag = "8")]
            pub proof_hash: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
            #[prost(message, optional, tag = "9")]
            pub detected_at: ::core::option::Option<::prost_types::Timestamp>,
            #[prost(map = "string, string", tag = "10")]
            pub metadata: ::std::collections::HashMap<
                ::prost::alloc::string::String,
                ::prost::alloc::string::String,
            >,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for MetaGovernanceRequest {
            #[inline]
            fn clone(&self) -> MetaGovernanceRequest {
                MetaGovernanceRequest {
                    request_id: ::core::clone::Clone::clone(&self.request_id),
                    agent_id: ::core::clone::Clone::clone(&self.agent_id),
                    tree_id: ::core::clone::Clone::clone(&self.tree_id),
                    action: ::core::clone::Clone::clone(&self.action),
                    rationale: ::core::clone::Clone::clone(&self.rationale),
                    risk_score: ::core::clone::Clone::clone(&self.risk_score),
                    affected_agent_ids: ::core::clone::Clone::clone(
                        &self.affected_agent_ids,
                    ),
                    proof_hash: ::core::clone::Clone::clone(&self.proof_hash),
                    detected_at: ::core::clone::Clone::clone(&self.detected_at),
                    metadata: ::core::clone::Clone::clone(&self.metadata),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for MetaGovernanceRequest {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for MetaGovernanceRequest {
            #[inline]
            fn eq(&self, other: &MetaGovernanceRequest) -> bool {
                self.risk_score == other.risk_score
                    && self.request_id == other.request_id
                    && self.agent_id == other.agent_id && self.tree_id == other.tree_id
                    && self.action == other.action && self.rationale == other.rationale
                    && self.affected_agent_ids == other.affected_agent_ids
                    && self.proof_hash == other.proof_hash
                    && self.detected_at == other.detected_at
                    && self.metadata == other.metadata
            }
        }
        pub struct MetaGovernanceResponse {
            #[prost(string, tag = "1")]
            pub request_id: ::prost::alloc::string::String,
            #[prost(enumeration = "MetaGovernanceVerdict", tag = "2")]
            pub verdict: i32,
            #[prost(string, tag = "3")]
            pub rationale: ::prost::alloc::string::String,
            #[prost(string, repeated, tag = "4")]
            pub conditions: ::prost::alloc::vec::Vec<::prost::alloc::string::String>,
            #[prost(string, tag = "5")]
            pub evaluated_by: ::prost::alloc::string::String,
            #[prost(message, optional, tag = "6")]
            pub evaluated_at: ::core::option::Option<::prost_types::Timestamp>,
            #[prost(bytes = "vec", optional, tag = "7")]
            pub decision_hash: ::core::option::Option<::prost::alloc::vec::Vec<u8>>,
            #[prost(string, optional, tag = "8")]
            pub jira_issue_key: ::core::option::Option<::prost::alloc::string::String>,
        }
        #[automatically_derived]
        impl ::core::clone::Clone for MetaGovernanceResponse {
            #[inline]
            fn clone(&self) -> MetaGovernanceResponse {
                MetaGovernanceResponse {
                    request_id: ::core::clone::Clone::clone(&self.request_id),
                    verdict: ::core::clone::Clone::clone(&self.verdict),
                    rationale: ::core::clone::Clone::clone(&self.rationale),
                    conditions: ::core::clone::Clone::clone(&self.conditions),
                    evaluated_by: ::core::clone::Clone::clone(&self.evaluated_by),
                    evaluated_at: ::core::clone::Clone::clone(&self.evaluated_at),
                    decision_hash: ::core::clone::Clone::clone(&self.decision_hash),
                    jira_issue_key: ::core::clone::Clone::clone(&self.jira_issue_key),
                }
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for MetaGovernanceResponse {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for MetaGovernanceResponse {
            #[inline]
            fn eq(&self, other: &MetaGovernanceResponse) -> bool {
                self.verdict == other.verdict && self.request_id == other.request_id
                    && self.rationale == other.rationale
                    && self.conditions == other.conditions
                    && self.evaluated_by == other.evaluated_by
                    && self.evaluated_at == other.evaluated_at
                    && self.decision_hash == other.decision_hash
                    && self.jira_issue_key == other.jira_issue_key
            }
        }
        #[repr(i32)]
        pub enum EventType {
            Unspecified = 0,
            DesignProposed = 1,
            SimulationCompleted = 2,
            DesignOptimized = 3,
            AgentMutation = 4,
            FabricationPlanned = 5,
            FabricationCompleted = 6,
            TestResult = 7,
            HumanReview = 8,
            ParameterChange = 9,
            ZkVerification = 10,
        }
        #[automatically_derived]
        #[doc(hidden)]
        unsafe impl ::core::clone::TrivialClone for EventType {}
        #[automatically_derived]
        impl ::core::clone::Clone for EventType {
            #[inline]
            fn clone(&self) -> EventType {
                *self
            }
        }
        #[automatically_derived]
        impl ::core::marker::Copy for EventType {}
        #[automatically_derived]
        impl ::core::fmt::Debug for EventType {
            #[inline]
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                ::core::fmt::Formatter::write_str(
                    f,
                    match self {
                        EventType::Unspecified => "Unspecified",
                        EventType::DesignProposed => "DesignProposed",
                        EventType::SimulationCompleted => "SimulationCompleted",
                        EventType::DesignOptimized => "DesignOptimized",
                        EventType::AgentMutation => "AgentMutation",
                        EventType::FabricationPlanned => "FabricationPlanned",
                        EventType::FabricationCompleted => "FabricationCompleted",
                        EventType::TestResult => "TestResult",
                        EventType::HumanReview => "HumanReview",
                        EventType::ParameterChange => "ParameterChange",
                        EventType::ZkVerification => "ZkVerification",
                    },
                )
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for EventType {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for EventType {
            #[inline]
            fn eq(&self, other: &EventType) -> bool {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                __self_discr == __arg1_discr
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Eq for EventType {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_receiver_is_total_eq(&self) -> () {}
        }
        #[automatically_derived]
        impl ::core::hash::Hash for EventType {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) -> () {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                ::core::hash::Hash::hash(&__self_discr, state)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::PartialOrd for EventType {
            #[inline]
            fn partial_cmp(
                &self,
                other: &EventType,
            ) -> ::core::option::Option<::core::cmp::Ordering> {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::PartialOrd::partial_cmp(&__self_discr, &__arg1_discr)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Ord for EventType {
            #[inline]
            fn cmp(&self, other: &EventType) -> ::core::cmp::Ordering {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::Ord::cmp(&__self_discr, &__arg1_discr)
            }
        }
        impl EventType {
            /// String value of the enum field names used in the ProtoBuf definition.
            ///
            /// The values are not transformed in any way and thus are considered stable
            /// (if the ProtoBuf definition does not change) and safe for programmatic use.
            pub fn as_str_name(&self) -> &'static str {
                match self {
                    Self::Unspecified => "EVENT_TYPE_UNSPECIFIED",
                    Self::DesignProposed => "DESIGN_PROPOSED",
                    Self::SimulationCompleted => "SIMULATION_COMPLETED",
                    Self::DesignOptimized => "DESIGN_OPTIMIZED",
                    Self::AgentMutation => "AGENT_MUTATION",
                    Self::FabricationPlanned => "FABRICATION_PLANNED",
                    Self::FabricationCompleted => "FABRICATION_COMPLETED",
                    Self::TestResult => "TEST_RESULT",
                    Self::HumanReview => "HUMAN_REVIEW",
                    Self::ParameterChange => "PARAMETER_CHANGE",
                    Self::ZkVerification => "ZK_VERIFICATION",
                }
            }
            /// Creates an enum from field names used in the ProtoBuf definition.
            pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
                match value {
                    "EVENT_TYPE_UNSPECIFIED" => Some(Self::Unspecified),
                    "DESIGN_PROPOSED" => Some(Self::DesignProposed),
                    "SIMULATION_COMPLETED" => Some(Self::SimulationCompleted),
                    "DESIGN_OPTIMIZED" => Some(Self::DesignOptimized),
                    "AGENT_MUTATION" => Some(Self::AgentMutation),
                    "FABRICATION_PLANNED" => Some(Self::FabricationPlanned),
                    "FABRICATION_COMPLETED" => Some(Self::FabricationCompleted),
                    "TEST_RESULT" => Some(Self::TestResult),
                    "HUMAN_REVIEW" => Some(Self::HumanReview),
                    "PARAMETER_CHANGE" => Some(Self::ParameterChange),
                    "ZK_VERIFICATION" => Some(Self::ZkVerification),
                    _ => None,
                }
            }
        }
        #[repr(i32)]
        pub enum GovernanceVerdict {
            Unspecified = 0,
            GovApproved = 1,
            GovRejected = 2,
            RequiresHuman = 3,
            GovConditional = 4,
            Timeout = 5,
        }
        #[automatically_derived]
        #[doc(hidden)]
        unsafe impl ::core::clone::TrivialClone for GovernanceVerdict {}
        #[automatically_derived]
        impl ::core::clone::Clone for GovernanceVerdict {
            #[inline]
            fn clone(&self) -> GovernanceVerdict {
                *self
            }
        }
        #[automatically_derived]
        impl ::core::marker::Copy for GovernanceVerdict {}
        #[automatically_derived]
        impl ::core::fmt::Debug for GovernanceVerdict {
            #[inline]
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                ::core::fmt::Formatter::write_str(
                    f,
                    match self {
                        GovernanceVerdict::Unspecified => "Unspecified",
                        GovernanceVerdict::GovApproved => "GovApproved",
                        GovernanceVerdict::GovRejected => "GovRejected",
                        GovernanceVerdict::RequiresHuman => "RequiresHuman",
                        GovernanceVerdict::GovConditional => "GovConditional",
                        GovernanceVerdict::Timeout => "Timeout",
                    },
                )
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for GovernanceVerdict {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for GovernanceVerdict {
            #[inline]
            fn eq(&self, other: &GovernanceVerdict) -> bool {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                __self_discr == __arg1_discr
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Eq for GovernanceVerdict {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_receiver_is_total_eq(&self) -> () {}
        }
        #[automatically_derived]
        impl ::core::hash::Hash for GovernanceVerdict {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) -> () {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                ::core::hash::Hash::hash(&__self_discr, state)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::PartialOrd for GovernanceVerdict {
            #[inline]
            fn partial_cmp(
                &self,
                other: &GovernanceVerdict,
            ) -> ::core::option::Option<::core::cmp::Ordering> {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::PartialOrd::partial_cmp(&__self_discr, &__arg1_discr)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Ord for GovernanceVerdict {
            #[inline]
            fn cmp(&self, other: &GovernanceVerdict) -> ::core::cmp::Ordering {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::Ord::cmp(&__self_discr, &__arg1_discr)
            }
        }
        impl GovernanceVerdict {
            /// String value of the enum field names used in the ProtoBuf definition.
            ///
            /// The values are not transformed in any way and thus are considered stable
            /// (if the ProtoBuf definition does not change) and safe for programmatic use.
            pub fn as_str_name(&self) -> &'static str {
                match self {
                    Self::Unspecified => "GOVERNANCE_VERDICT_UNSPECIFIED",
                    Self::GovApproved => "GOV_APPROVED",
                    Self::GovRejected => "GOV_REJECTED",
                    Self::RequiresHuman => "REQUIRES_HUMAN",
                    Self::GovConditional => "GOV_CONDITIONAL",
                    Self::Timeout => "TIMEOUT",
                }
            }
            /// Creates an enum from field names used in the ProtoBuf definition.
            pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
                match value {
                    "GOVERNANCE_VERDICT_UNSPECIFIED" => Some(Self::Unspecified),
                    "GOV_APPROVED" => Some(Self::GovApproved),
                    "GOV_REJECTED" => Some(Self::GovRejected),
                    "REQUIRES_HUMAN" => Some(Self::RequiresHuman),
                    "GOV_CONDITIONAL" => Some(Self::GovConditional),
                    "TIMEOUT" => Some(Self::Timeout),
                    _ => None,
                }
            }
        }
        #[repr(i32)]
        pub enum MetaGovernanceVerdict {
            MetaGovernanceUnspecified = 0,
            MetaApproved = 1,
            MetaRejected = 2,
            RequiresCemReview = 3,
            MetaConditional = 4,
            Deferred = 5,
        }
        #[automatically_derived]
        #[doc(hidden)]
        unsafe impl ::core::clone::TrivialClone for MetaGovernanceVerdict {}
        #[automatically_derived]
        impl ::core::clone::Clone for MetaGovernanceVerdict {
            #[inline]
            fn clone(&self) -> MetaGovernanceVerdict {
                *self
            }
        }
        #[automatically_derived]
        impl ::core::marker::Copy for MetaGovernanceVerdict {}
        #[automatically_derived]
        impl ::core::fmt::Debug for MetaGovernanceVerdict {
            #[inline]
            fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                ::core::fmt::Formatter::write_str(
                    f,
                    match self {
                        MetaGovernanceVerdict::MetaGovernanceUnspecified => {
                            "MetaGovernanceUnspecified"
                        }
                        MetaGovernanceVerdict::MetaApproved => "MetaApproved",
                        MetaGovernanceVerdict::MetaRejected => "MetaRejected",
                        MetaGovernanceVerdict::RequiresCemReview => "RequiresCemReview",
                        MetaGovernanceVerdict::MetaConditional => "MetaConditional",
                        MetaGovernanceVerdict::Deferred => "Deferred",
                    },
                )
            }
        }
        #[automatically_derived]
        impl ::core::marker::StructuralPartialEq for MetaGovernanceVerdict {}
        #[automatically_derived]
        impl ::core::cmp::PartialEq for MetaGovernanceVerdict {
            #[inline]
            fn eq(&self, other: &MetaGovernanceVerdict) -> bool {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                __self_discr == __arg1_discr
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Eq for MetaGovernanceVerdict {
            #[inline]
            #[doc(hidden)]
            #[coverage(off)]
            fn assert_receiver_is_total_eq(&self) -> () {}
        }
        #[automatically_derived]
        impl ::core::hash::Hash for MetaGovernanceVerdict {
            #[inline]
            fn hash<__H: ::core::hash::Hasher>(&self, state: &mut __H) -> () {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                ::core::hash::Hash::hash(&__self_discr, state)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::PartialOrd for MetaGovernanceVerdict {
            #[inline]
            fn partial_cmp(
                &self,
                other: &MetaGovernanceVerdict,
            ) -> ::core::option::Option<::core::cmp::Ordering> {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::PartialOrd::partial_cmp(&__self_discr, &__arg1_discr)
            }
        }
        #[automatically_derived]
        impl ::core::cmp::Ord for MetaGovernanceVerdict {
            #[inline]
            fn cmp(&self, other: &MetaGovernanceVerdict) -> ::core::cmp::Ordering {
                let __self_discr = ::core::intrinsics::discriminant_value(self);
                let __arg1_discr = ::core::intrinsics::discriminant_value(other);
                ::core::cmp::Ord::cmp(&__self_discr, &__arg1_discr)
            }
        }
        impl MetaGovernanceVerdict {
            /// String value of the enum field names used in the ProtoBuf definition.
            ///
            /// The values are not transformed in any way and thus are considered stable
            /// (if the ProtoBuf definition does not change) and safe for programmatic use.
            pub fn as_str_name(&self) -> &'static str {
                match self {
                    Self::MetaGovernanceUnspecified => "META_GOVERNANCE_UNSPECIFIED",
                    Self::MetaApproved => "META_APPROVED",
                    Self::MetaRejected => "META_REJECTED",
                    Self::RequiresCemReview => "REQUIRES_CEM_REVIEW",
                    Self::MetaConditional => "META_CONDITIONAL",
                    Self::Deferred => "DEFERRED",
                }
            }
            /// Creates an enum from field names used in the ProtoBuf definition.
            pub fn from_str_name(value: &str) -> ::core::option::Option<Self> {
                match value {
                    "META_GOVERNANCE_UNSPECIFIED" => {
                        Some(Self::MetaGovernanceUnspecified)
                    }
                    "META_APPROVED" => Some(Self::MetaApproved),
                    "META_REJECTED" => Some(Self::MetaRejected),
                    "REQUIRES_CEM_REVIEW" => Some(Self::RequiresCemReview),
                    "META_CONDITIONAL" => Some(Self::MetaConditional),
                    "DEFERRED" => Some(Self::Deferred),
                    _ => None,
                }
            }
        }
        /// Generated client implementations.
        pub mod cathedral_bridge_client {
            #![allow(
                unused_variables,
                dead_code,
                missing_docs,
                clippy::wildcard_imports,
                clippy::let_unit_value,
            )]
            use tonic::codegen::*;
            use tonic::codegen::http::Uri;
            pub struct CathedralBridgeClient<T> {
                inner: tonic::client::Grpc<T>,
            }
            #[automatically_derived]
            impl<T: ::core::fmt::Debug> ::core::fmt::Debug for CathedralBridgeClient<T> {
                #[inline]
                fn fmt(&self, f: &mut ::core::fmt::Formatter) -> ::core::fmt::Result {
                    ::core::fmt::Formatter::debug_struct_field1_finish(
                        f,
                        "CathedralBridgeClient",
                        "inner",
                        &&self.inner,
                    )
                }
            }
            #[automatically_derived]
            impl<T: ::core::clone::Clone> ::core::clone::Clone
            for CathedralBridgeClient<T> {
                #[inline]
                fn clone(&self) -> CathedralBridgeClient<T> {
                    CathedralBridgeClient {
                        inner: ::core::clone::Clone::clone(&self.inner),
                    }
                }
            }
            impl CathedralBridgeClient<tonic::transport::Channel> {
                /// Attempt to create a new client by connecting to a given endpoint.
                pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
                where
                    D: TryInto<tonic::transport::Endpoint>,
                    D::Error: Into<StdError>,
                {
                    let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
                    Ok(Self::new(conn))
                }
            }
            impl<T> CathedralBridgeClient<T>
            where
                T: tonic::client::GrpcService<tonic::body::BoxBody>,
                T::Error: Into<StdError>,
                T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
                <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
            {
                pub fn new(inner: T) -> Self {
                    let inner = tonic::client::Grpc::new(inner);
                    Self { inner }
                }
                pub fn with_origin(inner: T, origin: Uri) -> Self {
                    let inner = tonic::client::Grpc::with_origin(inner, origin);
                    Self { inner }
                }
                pub fn with_interceptor<F>(
                    inner: T,
                    interceptor: F,
                ) -> CathedralBridgeClient<InterceptedService<T, F>>
                where
                    F: tonic::service::Interceptor,
                    T::ResponseBody: Default,
                    T: tonic::codegen::Service<
                        http::Request<tonic::body::BoxBody>,
                        Response = http::Response<
                            <T as tonic::client::GrpcService<
                                tonic::body::BoxBody,
                            >>::ResponseBody,
                        >,
                    >,
                    <T as tonic::codegen::Service<
                        http::Request<tonic::body::BoxBody>,
                    >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
                {
                    CathedralBridgeClient::new(
                        InterceptedService::new(inner, interceptor),
                    )
                }
                /// Compress requests with the given encoding.
                ///
                /// This requires the server to support it otherwise it might respond with an
                /// error.
                #[must_use]
                pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
                    self.inner = self.inner.send_compressed(encoding);
                    self
                }
                /// Enable decompressing responses.
                #[must_use]
                pub fn accept_compressed(
                    mut self,
                    encoding: CompressionEncoding,
                ) -> Self {
                    self.inner = self.inner.accept_compressed(encoding);
                    self
                }
                /// Limits the maximum size of a decoded message.
                ///
                /// Default: `4MB`
                #[must_use]
                pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
                    self.inner = self.inner.max_decoding_message_size(limit);
                    self
                }
                /// Limits the maximum size of an encoded message.
                ///
                /// Default: `usize::MAX`
                #[must_use]
                pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
                    self.inner = self.inner.max_encoding_message_size(limit);
                    self
                }
                pub async fn ingest(
                    &mut self,
                    request: impl tonic::IntoRequest<super::IngestRequest>,
                ) -> std::result::Result<
                    tonic::Response<super::IngestResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/Ingest",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new("cathedral.v1.CathedralBridge", "Ingest"),
                        );
                    self.inner.unary(req, path, codec).await
                }
                pub async fn request_governance(
                    &mut self,
                    request: impl tonic::IntoRequest<super::GovernanceRequest>,
                ) -> std::result::Result<
                    tonic::Response<super::GovernanceResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/RequestGovernance",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new(
                                "cathedral.v1.CathedralBridge",
                                "RequestGovernance",
                            ),
                        );
                    self.inner.unary(req, path, codec).await
                }
                pub async fn query_provenance(
                    &mut self,
                    request: impl tonic::IntoRequest<super::QueryProvenanceRequest>,
                ) -> std::result::Result<
                    tonic::Response<super::QueryProvenanceResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/QueryProvenance",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new(
                                "cathedral.v1.CathedralBridge",
                                "QueryProvenance",
                            ),
                        );
                    self.inner.unary(req, path, codec).await
                }
                pub async fn create_agent(
                    &mut self,
                    request: impl tonic::IntoRequest<super::CreateAgentRequest>,
                ) -> std::result::Result<
                    tonic::Response<super::CreateAgentResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/CreateAgent",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new(
                                "cathedral.v1.CathedralBridge",
                                "CreateAgent",
                            ),
                        );
                    self.inner.unary(req, path, codec).await
                }
                pub async fn mutate_agent(
                    &mut self,
                    request: impl tonic::IntoRequest<super::AgentSelfMutation>,
                ) -> std::result::Result<
                    tonic::Response<super::MutateAgentResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/MutateAgent",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new(
                                "cathedral.v1.CathedralBridge",
                                "MutateAgent",
                            ),
                        );
                    self.inner.unary(req, path, codec).await
                }
                pub async fn request_meta_governance(
                    &mut self,
                    request: impl tonic::IntoRequest<super::MetaGovernanceRequest>,
                ) -> std::result::Result<
                    tonic::Response<super::MetaGovernanceResponse>,
                    tonic::Status,
                > {
                    self.inner
                        .ready()
                        .await
                        .map_err(|e| {
                            tonic::Status::unknown(
                                ::alloc::__export::must_use({
                                    ::alloc::fmt::format(
                                        format_args!("Service was not ready: {0}", e.into()),
                                    )
                                }),
                            )
                        })?;
                    let codec = tonic::codec::ProstCodec::default();
                    let path = http::uri::PathAndQuery::from_static(
                        "/cathedral.v1.CathedralBridge/RequestMetaGovernance",
                    );
                    let mut req = request.into_request();
                    req.extensions_mut()
                        .insert(
                            GrpcMethod::new(
                                "cathedral.v1.CathedralBridge",
                                "RequestMetaGovernance",
                            ),
                        );
                    self.inner.unary(req, path, codec).await
                }
            }
        }
    }
}
