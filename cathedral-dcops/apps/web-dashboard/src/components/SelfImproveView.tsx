import { useEffect, useState } from 'react';
// import useWebSocket from 'react-use-websocket';
// import { toast } from 'sonner';

export function SelfImproveView() {
    const [proposals, setProposals] = useState<any[]>([]);
    const [filter, setFilter] = useState({ risk: '', status: '' });
    const [tab, setTab] = useState<'monorepo' | 'proposals'>('proposals');

    /*
    const { lastJsonMessage } = useWebSocket('ws://localhost:3000/ws', {
        onMessage: (event) => {
            const data = JSON.parse(event.data);
            toast.success(`Nova proposta: ${data.title}`, { duration: 5000 });
            setProposals(prev => [data, ...prev]);
        },
    });
    */

    const fetchProposals = async () => {
        const params = new URLSearchParams(filter);
        const res = await fetch(`/api/proposals?${params}`);
        setProposals(await res.json());
    };

    useEffect(() => { fetchProposals(); }, [filter]);

    return (
        <div>
            <h1>Self-Improvement</h1>
            <div className="tabs">
                <button onClick={() => setTab('proposals')}>Propostas</button>
                <button onClick={() => setTab('monorepo')}>Monorepo</button>
            </div>
            <div className="filters">
                <select onChange={(e) => setFilter({ ...filter, risk: e.target.value })}>
                    <option value="">Todos</option>
                    <option value="Low">Baixo</option>
                    <option value="Medium">Médio</option>
                    <option value="High">Alto</option>
                    <option value="Critical">Crítico</option>
                </select>
            </div>
            <ul>
                {proposals.map(p => (
                    <li key={p.id}>
                        <strong>{p.title}</strong> ({p.risk_level}) - {p.validation_status}
                    </li>
                ))}
            </ul>
        </div>
    );
}