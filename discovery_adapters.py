#!/usr/bin/env python3
# discovery_adapters.py — Phase 0 infrastructure ingestion

import boto3
from azure.mgmt.compute import ComputeManagementClient
from azure.identity import DefaultAzureCredential
from pyVmomi import vim, vmodl
from pyVim import connect
import json, requests

class MultiCloudDiscovery:
    def __init__(self, hypergraph_api_endpoint="http://localhost:9290/api"):
        self.hg_endpoint = hypergraph_api_endpoint

    def discover_aws_ec2(self, region='us-east-1'):
        ec2 = boto3.client('ec2', region_name=region)
        instances = ec2.describe_instances()
        vertices = []
        for res in instances['Reservations']:
            for inst in res['Instances']:
                v = {
                    "vid": f"aws:ec2:{inst['InstanceId']}",
                    "vtype": "VirtualMachine",
                    "properties": {
                        "provider": "AWS",
                        "name": [t['Value'] for t in inst.get('Tags', []) if t['Key']=='Name'][0] if inst.get('Tags') else inst['InstanceId'],
                        "state": inst['State']['Name'],
                        "type": inst['InstanceType'],
                        "vpc": inst.get('VpcId', '')
                    }
                }
                vertices.append(v)
                # push to hypergraph
                requests.post(f"{self.hg_endpoint}/hypergraph/vertex", json=v)
        return vertices

    def discover_azure_vm(self, subscription_id):
        credential = DefaultAzureCredential()
        compute_client = ComputeManagementClient(credential, subscription_id)
        vertices = []
        for vm in compute_client.virtual_machines.list_all():
            v = {
                "vid": f"azure:vm:{vm.vm_id}",
                "vtype": "VirtualMachine",
                "properties": {
                    "provider": "Azure",
                    "name": vm.name,
                    "state": compute_client.virtual_machines.instance_view(vm.resource_group, vm.name).statuses[1].display_status,
                    "type": vm.hardware_profile.vm_size,
                    "vnet": vm.network_profile.network_interfaces[0].id.split('/')[-1] if vm.network_profile else ''
                }
            }
            vertices.append(v)
            requests.post(f"{self.hg_endpoint}/hypergraph/vertex", json=v)
        return vertices

    def discover_vmware_vms(self, host, user, password):
        si = connect.SmartConnect(host=host, user=user, pwd=password)
        content = si.RetrieveContent()
        container = content.rootFolder
        viewType = [vim.VirtualMachine]
        recursive = True
        containerView = content.viewManager.CreateContainerView(container, viewType, recursive)
        children = containerView.view
        vertices = []
        for vm in children:
            v = {
                "vid": f"vmware:{vm._moId}",
                "vtype": "VirtualMachine",
                "properties": {
                    "provider": "VMware",
                    "name": vm.name,
                    "state": vm.summary.runtime.powerState,
                    "type": vm.summary.config.vmPathName,
                    "host": vm.summary.runtime.host.name if vm.summary.runtime.host else ''
                }
            }
            vertices.append(v)
            requests.post(f"{self.hg_endpoint}/hypergraph/vertex", json=v)
        return vertices

    def create_telco_edges(self):
        # Example: link 5G core components
        edges = [
            {"etype":"communicates_with","vertices":["ns:upf-1","ns:smf"]},
            {"etype":"depends_on","vertices":["ns:amf","ns:udm"]}
        ]
        for e in edges:
            requests.post(f"{self.hg_endpoint}/hypergraph/edge", json=e)
