#!/usr/bin/env python3
# "network_anomaly_detector.py" — Substrato 863.4
# Monitora conexões de saída e bloqueia IPs suspeitos
import re
import subprocess


class NetworkAnomalyDetector:
    def __init__(self):
        self.known_malicious_ips = set()

    def scan_connections(self):
        # Exemplo usando netstat (Linux)
        try:
            output = subprocess.check_output(["netstat", "-ntup"]).decode()
        except Exception as e:
            print(f"[ERRO] Falha ao executar netstat: {e}")
            return

        for line in output.splitlines():
            if "ESTABLISHED" in line:
                # extrai IP de destino
                match = re.search(r"(\d+\.\d+\.\d+\.\d+):\d+\s+ESTABLISHED", line)
                if match:
                    ip = match.group(1)
                    if ip in self.known_malicious_ips:
                        print(f"[ALERTA] Conexão com IP malicioso: {ip}")
                        # Bloqueia via iptables (exemplo)
                        # subprocess.run(["sudo", "iptables", "-A", "OUTPUT", "-d", ip, "-j", "DROP"])


if __name__ == "__main__":
    detector = NetworkAnomalyDetector()
    detector.scan_connections()
