use criterion::{criterion_group, criterion_main, Criterion, BenchmarkId};
// use cathedral_test_support::wormgraph::TestWormGraph;
// use cathedral_wormgraph::{ProposalFilter, RiskLevel};

fn bench_insert_proposals(c: &mut Criterion) {
    // let wg = TestWormGraph::new();
    let mut group = c.benchmark_group("insert_proposals");

    for size in [10, 100, 1000, 10000].iter() {
        group.bench_with_input(BenchmarkId::new("insert", size), size, |b, &size| {
            b.iter(|| {
                // let wg = TestWormGraph::new();
                // wg.populate_with_proposals(size, "did:test:author").unwrap();
            })
        });
    }
    group.finish();
}

fn bench_list_proposals(c: &mut Criterion) {
    // let wg = TestWormGraph::new();
    // wg.populate_with_proposals(10000, "did:test:author").unwrap();

    let mut group = c.benchmark_group("list_proposals");
    for limit in [10, 50, 100, 500].iter() {
        group.bench_with_input(BenchmarkId::new("limit", limit), limit, |b, &limit| {
            // let filter = ProposalFilter { limit: Some(limit), offset: None, risk_level: None, status: None, author_did: None };
            b.iter(|| {
                // let _ = wg.list_proposals(filter.clone());
            })
        });
    }
    group.finish();
}

criterion_group!(benches, bench_insert_proposals, bench_list_proposals);
criterion_main!(benches);
