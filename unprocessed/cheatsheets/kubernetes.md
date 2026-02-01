______________________________________________________________________

## title: "Kubernetes (K8s)" draft: false

## Overview

Official cheatsheet here: https://kubernetes.io/docs/reference/kubectl/cheatsheet/

I often have to manage multiple clusters, so you'll see a pattern in here where I do for loops over a $clusters variable. That variable contains a space-separated list of cluster names, like this:

```
export clusters='cluster1.com cluster2.com cluster3.com'
```

## Tools

- https://github.com/garethr/kubeval
- https://helm.sh/
- https://kubernetes.io/docs/setup/independent/install-kubeadm/

## Useful Commands

### Show broken pods

This is different than status.phase=Running, because even CrashLoopBackOff pods are in status.phase=Running. This is just a quick view into all things that are broken.

```
kubectl get pods --all-namespaces --no-headers | grep -vE '(Running|Completed)' | awk '{print $1}'
```

### Get all nodes with label zone=db

```
kubectl get nodes -l zone=db -o json | jq -r '.items[].metadata.name'
```

### Port forwarding from my workstation directly to a Kubernetes pod!

Use local_port:remote_port syntax if you already have something running on 27017.

```
kubectl port-forward pod/mongodb-0 27017
```

### Show nodes and pods that are weird/wrong/broken

```
for cluster in $clusters; do
  kubectl config use-context $cluster
  kubectl get nodes --no-headers | grep -v ' Ready '
  kubectl get pods --all-namespaces --no-headers  | grep -vE '(Running|Completed)'
done
```

### Which pods were evicted from which nodes and why

```
for cluster in $clusters; do
  kubectl config use-context $cluster
  for pod in $(kubectl get pods --all-namespaces | grep Evicted | awk '{ print $1 }'); do
    kubectl describe pods $pod | grep -E '^(Name|Node|Message):'
  done
done
```

### Delete all Evicted and CrashLoopBackOff pods

```
for cluster in $clusters; do
  kubectl config use-context $cluster
  for pod in $(kubectl get pods --all-namespaces | grep -E '(Evicted|CrashLoopBackOff)' | awk '{ print $1 }'); do
    kubectl delete pod $pod
  done
done
```

### Show logs for specific container (like initContainer) in a pod

```
kubectl logs mydumbapp-0 -c mypeskyinitcontainer
```

### Check dmesg on all nodes

```
for cluster in $clusters; do
  kubectl config use-context $cluster
  for node in $(kubectl get nodes -o json | jq -r '.items[].metadata.name'); do
    ssh -J ubuntu@bastion.$env.evanstucker.com -q -o StrictHostKeyChecking=no ubuntu@$node -- dmesg | grep unregister_netdevice
  done
done
```

### Patch memory requests and limits for a deploy

```
kubectl patch deploy elasticsearch-master -p '{"spec":{"template":{"spec":{"containers":[{"name":"elasticsearch","resources":{"limits":{"memory":"1024Mi"},"requests":{"memory":"512Mi"}}}]}}}}'
```

### Why did my pods die?

```
for pod in $(kubectl get pods --all-namespaces --no-headers | awk '{print $1}'); do
  echo "===== $pod"
  kubectl get pod $pod -o go-template='{{range.status.containerStatuses}}{{"LastState: "}}{{.lastState}}{{end}}{{"\n"}}' | grep -oiE 'reason:[a-z0-9]+'
done
```

### Show node resource requests and limits

The Kubernetes Dashboard would probably be easier to deal with...

```
for node in $(kubectl get nodes --no-headers | awk '{print $1}'); do
  echo "===== $node"
  kubectl describe node $node | grep Allocated -A 5 | grep -ve Event -ve Allocated -ve percent -ve --
  echo
done
```

### Find OOMKilled (out of memory) things

One-liner:

```
kubectl get pods -A -o json | jq -r '.items[] | select(.status.containerStatuses[].lastState.terminated.reason == "OOMKilled") | "\(.metadata.namespace)/\(.metadata.name)"'
```

Some weird old way where I was logging into nodes to check:

```
for cluster in $clusters; do
  kubectl config use-context $cluster
  for node in $(kubectl get nodes -o json | jq -r .items[].metadata.name); do
    echo "===== $cluster $node"
    ssh -q -o StrictHostKeyChecking=no -J "ubuntu@bastion.${cluster}" "ubuntu@${node}" -- journalctl -p 3 | grep -i mem
  done
done
```

### Miscellaneous

join \<(kubectl get nodes -L kops.k8s.io/instancegroup -L failure-domain.beta.kubernetes.io/zone) \<(kubectl top nodes) | column -t

Use 'kubectl replace' instead of delete and apply.

### Adding IAM User mappings to an EKS cluster

This should probably be avoided. You should probably use `eksctl create iamidentitymapping` to add roles to the cluster. But if, for some reason, you need to add user mappings directly:

```bash
kubectl edit cm -n kube-system aws-auth
```

and add the user under `mapUsers: |`:

```yaml
 - userarn: arn:aws:iam::999999999999:user/evans.tucker
   username: admin
   groups:
     - system:masters
```

### Creating a debugging pod that automatically deletes itself when you're done

```bash
kubectl run evanstest --rm -it --image alpine -- /bin/sh
```

### Decrypt and show all secrets for a particular release

```bash
release=postgresql
for secret in $(kubectl get secrets -l release=${release} -o json | jq -r '.items[].data | to_entries[] | "\(.key):\(.value)"'); do
  echo "$(echo $secret | cut -d: -f1): $(echo $secret | cut -d: -f2- | base64 -d)"
done
```

### If a PV get stuck in Terminating status

```bash
for pv in $(kubectl get pv | sed 1d | awk '{ print $1 }'); do
  kubectl patch pv $pv -p '{"metadata":{"finalizers":null}}'
done
```

### Get public address for all EKS nodes

```
kubectl get nodes -o json | jq -r '.items[].status.addresses[] | select(.type=="ExternalDNS") | .address'
```

### Get public DNS for an EKS node from an internal IP address

```
node_ip=192.168.55.173
kubectl get nodes -o json | jq -r ".items[].status | select(.addresses[].address==\"${node_ip}\") | .addresses[] | select(.type==\"ExternalDNS\") | .address"
ec2-15-189-86-169.eu-west-3.compute.amazonaws.com
```

### Add kubeconfig for all clusters in all regions in all AWS accounts to your ~/.kube/config file

```
while read profile; do
  echo "# Profile: ${profile}"
  export AWS_DEFAULT_REGION='us-east-1'
  export AWS_PROFILE="${profile}"
  for region in $(aws ec2 describe-regions | jq -r .Regions[].RegionName); do
    export AWS_REGION="${region}"
    for cluster in $(aws eks list-clusters --region $AWS_REGION | jq -r .clusters[]); do
      name="$(aws eks describe-cluster --region $AWS_REGION --name $cluster | jq -r '.cluster.name')"
      version="$(aws eks describe-cluster --region $AWS_REGION --name $cluster | jq -r '.cluster.version')"
      if [[ -n "$name" ]]; then
        echo "${name} ${AWS_REGION} ${version}"
      fi
    done
  done
done < <(sed -nE "s/^\[profile ['\"]*([^'\"]+)['\"]*\]/\1/p" "${HOME}/.aws/config")
#done < <(grep -o '^\w*\[.*\]' .aws/credentials | sed -E 's/(\[|\])//g')
```

### Add kubeconfig for all clusters in all subscriptions in your Azure account to your ~/.kube/config file

```
az login
for subscription in $(az account list | jq -r '.[].name'); do
  az account set --subscription "${subscription}"
  for cluster in $(az aks list | jq -r '.[] | "\(.name),\(.resourceGroup)"'); do
    name="$(echo "${cluster}" | cut -d, -f1)"
    resource_group="$(echo "${cluster}" | cut -d, -f2)"
    az aks get-credentials --name "${name}" --overwrite-existing --resource-group "${resource_group}"
  done
done
```

### Show all versions of a Helm chart

```
$ helm search repo fluxcd/flux --versions
NAME       	CHART VERSION	APP VERSION	DESCRIPTION
fluxcd/flux	1.11.2       	1.24.1     	Flux is a tool that automatically ensures that ...
fluxcd/flux	1.11.1       	1.24.1     	Flux is a tool that automatically ensures that ...
fluxcd/flux	1.11.0       	1.24.0     	Flux is a tool that automatically ensures that ...
fluxcd/flux	1.10.2       	1.23.2     	Flux is a tool that automatically ensures that ...
...
```

### Monkeypatch all ingresses

```
for ing in $(kubectl get ing -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{"\n"}{end}' 2>/dev/null); do
  ing_namespace=$(echo "$ing" | cut -d'/' -f 1)
  ing_name=$(echo "$ing" | cut -d'/' -f 2)
  kubectl patch ing -n "$ing_namespace" "$ing_name" -p '{"metadata":{"annotations":{"ingressClassName":"temp"}}}'
done
```

### Find unencrypted storageclasses

```
for c in cluster1 cluster2; do echo "# $c"; kubectl config use-context $c; kubectl get sc -o json | jq -r '.items[].parameters | .encrypted // false'; done
```

### Do a rolling restart of all pods in a deployment

```
kubectl rollout restart deployment/abc
```

### Copy a secret from one namespace to another

```
# https://stackoverflow.com/a/60627332/10443350
kubectl get secret -n origin-ns my-secret-name -ojson | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid) | .metadata.creationTimestamp=null' | kubectl apply -n destination-ns -f -
```

### Watch current events in the cluster

```
k get events --sort-by='.lastTimestamp' -A -w
```

### Listing all Flux v2 resources

```
flux get all -A
```

or, even more comprehensively (Thanks, Iris!):

```
for i in $(kubectl get crd | awk '$0 ~ /toolkit.fluxcd.io/ { print $1 }'); do
  echo "$i" | sed -e "s/\(^.*$\)/$(tput setaf 1)\1:$(tput sgr 0)/"
  kubectl get $i -A
  echo
done | sed -e "s/\(^.*NAME.*$\)/$(tput setaf 2)\1$(tput sgr 0)/"
```

### Run a command in all clusters or all contexts

```
for c in $(kubectl config get-contexts -o name); do
  kubectl config use-context $c
  k get ns
done
```

# How to update all codefi/generic-app Helm chart versions in a helmfile

# Requires https://github.com/mikefarah/yq/#install

yq eval -i '(.releases[]|select(.chart=="codefi/generic-app")|.version) = "3.7.3"' helmfile.yaml

kubectl patch deploy elasticsearch-master -p '{"spec":{"template":{"spec":{"containers":[{"name":"elasticsearch","resources":{"limits":{"memory":"1024Mi"},"requests":{"memory":"512Mi"}}}]}}}}'

for pod in $(devkubectl get pods --no-headers | awk '{print $1}'); do
echo "===== $pod"
devkubectl get pod $pod -o go-template='{{range.status.containerStatuses}}{{"LastState: "}}{{.lastState}}{{end}}{{"\\n"}}' | grep -oiE 'reason:[a-z0-9]+'
done

for node in $(kubectl get nodes --no-headers | awk '{print $1}'); do echo "===== $node"; kubectl describe node $node | grep Allocated -A 5 | grep -ve Event -ve Allocated -ve percent -ve -- ; echo; done

ssh-add ~/.ssh/*.pem
export env=dev
export command='grep -i oom /var/log/*/current'
for node in $(kubectl --kubeconfig="${HOME}/.kube/config-${env}" get nodes -o json | jq -r '.items[].metadata.name'); do ssh -J ubuntu@bastion.${env}.balanc3.net -q -o StrictHostKeyChecking=no ubuntu@$node -- $command; done

### Get all nodes in a nodegroup

```
nodegroup=whatever
kubectl get nodes -o json | jq -r ".items[] | select(.metadata.labels.\"eks.amazonaws.com/nodegroup\" == \"${nodegroup}\") | .metadata.name"
```

### Drain and terminate all nodes

```
kubectl config use-context my_cluster

export AWS_PROFILE=my_profile

for node in $(kubectl get nodes -o name); do
  kubectl drain --delete-emptydir-data --ignore-daemonsets "$node"
  provider_id=$(kubectl get "$node" -o jsonpath='{.spec.providerID}')
  region=$(echo "$provider_id" | cut -d'/' -f 4 | sed 's/[a-z]$//')
  instance_id=$(echo "$provider_id" | cut -d'/' -f 5)
  aws ec2 terminate-instances --region "$region" --instance-ids "$instance_id"
done
```

```
# Shut everything down!
kubectl scale --replicas=0 deployment --all

# Nice restart as compared to just deleting pods.
kubectl rollout restart sts

# How long does it take for pods to become ready?
pods_json=$(kubectl get pods -A -o json)
(echo -e "Seconds\tNamespace\tPod"
echo -e "-------\t---------\t---"
for pod_uid in $(echo "$pods_json" | jq -r '.items[].metadata.uid'); do
  pod_json=$(echo "$pods_json" | jq -r ".items[] | select(.metadata.uid == \"$pod_uid\")")
  ns=$(echo "$pod_json" |  jq -r '.metadata.namespace')
  pod=$(echo "$pod_json" |  jq -r '.metadata.name')
  pod_scheduled=$(date +%s -d $(echo "$pod_json" | jq -r '.status.conditions[] | select(.type == "Initialized") | .lastTransitionTime'))
  pod_ready=$(date +%s -d $(echo "$pod_json" | jq -r '.status.conditions[] | select(.type == "Ready") | .lastTransitionTime'))
  echo -e "$(( pod_ready - pod_scheduled ))\t${ns}\t${pod}"
done)
```

```
# Show all pods that are running on a specific nodegroup
export ng=your_ng_name
k get pods -A -o wide | grep -E "($(k get nodes -l eks.amazonaws.com/nodegroup=${ng} -o name | cut -d/ -f2 | xargs | tr ' ' '|'))"

# Fix deprecated and removed APIs in existing Helm releases
# When upgrading a cluster from 1.24 to 1.25, PodSecurityPolicy was removed.
# Later, when trying to deploy a Helm release that was updated to remove PSPs,
# the deploy failed, because it was trying to remove the old PSPs, but the
# cluster no longer had them. To fix this, I had to download the mapkubeapis
# Helm plugin and run the command below. Note that some clusters may have
# Windows-style newlines - see this issue:
# https://github.com/helm/helm-mapkubeapis/issues/82
# Also see https://kubernetes.io/docs/reference/using-api/deprecation-guide/
eval $(helm ls -A -a | sed 1d | awk '{ print "helm mapkubeapis -n "$2" "$1";" }')

# Show pods that have containers that that aren't ready
# https://stackoverflow.com/a/78596733/10443350
k get pods -A -o json | jq -r '.items[] | select(.status.containerStatuses[].ready == false) | "\(.metadata.namespace) \(.metadata.name)"' | sort -u | column -t

# Combine all your kubeconfig files into ~/.kube/config
cp ~/.kube/config ~/.kube/config.$(date +%s) && export KUBECONFIG=$(find "${HOME}/.kube" -maxdepth 1 -type f ! -name config ! -name 'config.*' | tr "\n" ":"); kubectl config view --flatten > ~/.kube/config; chmod 600 ~/.kube/config; unset KUBECONFIG;

# Show what flux will change
flux diff kustomization -n flux-system apps --path apps/test --recursive

# Show all flux objects
for api in $(k api-resources | grep fluxcd.io | cut -d' ' -f1); do echo -e "\n##### ${api}"; k get $api -A; done

# Watch flux events
flux events -Aw

# Show all flux objects that aren't ready
flux get all -A --status-selector ready=false

# Decrypt all fields of a secret
# https://stackoverflow.com/a/58117444/10443350
k get secret $name -n $ns -o go-template='{{range $k,$v := .data}}{{printf "%s: " $k}}{{if not $v}}{{$v}}{{else}}{{$v | base64decode}}{{end}}{{"\n"}}{{end}}'

# Show helm values for an installed release
helm get values -n $ns $name

# Get helm values for all releases in a cluster
# Based on https://stackoverflow.com/a/67638584
readarray -t helm_releases < <(helm ls -A -a -o json | jq -c '.[]')
for release in "${helm_releases[@]}"; do
  namespace=$(jq -r '.namespace' <<< "$release")
  name=$(jq -r '.name' <<< "$release")
  helm get values -n "${namespace}" "${name}" -o yaml > "${namespace}_${name}.helm_values.yaml"
done

# Generate a helmfile for all releases in the cluster:
helm ls -A -a -o yaml | yq '
  map({
    "name": .name,
    "namespace": .namespace,
    "chart": (.chart | split("-") | .[0:-1] | join("-") | . + "/" + .),
    "version": .chart | split("-")[-1],
    "values": [.namespace + "_" + .name + ".helm_values.yaml"]
  }) | {"releases": .}
' | tee helmfile.yaml

# Show resources in namespaces that don't have any pods (AKA find empty namespaces)
# Requires https://github.com/luksa/kubectl-plugins
for ns in $(k get ns -o name | cut -d / -f 2- | grep -vE '^(default|kube-node-lease|kube-public|kube-system)$'); do
  for podless_ns in $(k get pods -n $ns |& grep "No resources found in" | awk '{ print $5 }'); do
    echo -e "\n# $podless_ns"
    k really get all -n $podless_ns
  done
done

```

## Getting basic info about all AWS EKS clusters in all profiles in all regions

```
for AWS_PROFILE in $(aws configure list-profiles); do
  export AWS_PROFILE
  for AWS_REGION in $(aws --region us-east-1 ec2 describe-regions | jq -r .Regions[].RegionName); do
    export AWS_REGION
    for cluster in $(aws eks list-clusters --region $AWS_REGION | jq -r .clusters[]); do
      cluster_json=$(aws eks describe-cluster --region $AWS_REGION --name $cluster)
      name="$(echo "$cluster_json" | jq -r '.cluster.name')"
      version="$(echo "$cluster_json" | jq -r '.cluster.version')"
      if [[ -n "$name" ]]; then
        # Not putting AWS_PROFILE in this output, because I want to sort/dedup, and I have several cases where I have access to both an Admin and a DevOps role, which output duplicate lines.
        echo "${name} ${version} ${AWS_REGION}"
      fi
    done
  done
done | sort -u
```

## Configuring kubeconfig for all EKS clusters in all profiles in all regions

```
for AWS_PROFILE in $(aws configure list-profiles | grep -v '_Admin'); do
  export AWS_PROFILE
  for AWS_REGION in $(aws --region us-east-1 ec2 describe-regions | jq -r .Regions[].RegionName); do
    export AWS_REGION
    for cluster in $(aws eks list-clusters --region $AWS_REGION | jq -r .clusters[]); do
      cluster_json=$(aws eks describe-cluster --region $AWS_REGION --name $cluster)
      name="$(echo "$cluster_json" | jq -r '.cluster.name')"
      version="$(echo "$cluster_json" | jq -r '.cluster.version')"
      if [[ -n "$name" ]]; then
        aws eks update-kubeconfig \
          --name "$name" \
          --profile "$AWS_PROFILE" \
          --region "$AWS_REGION" \
          --user-alias "${name}_${AWS_REGION}_${AWS_PROFILE}" \
          --alias "${name}_${AWS_REGION}_${AWS_PROFILE}" \
          --kubeconfig "${HOME}/.kube/${name}_${AWS_REGION}_${AWS_PROFILE}"
      fi
    done
  done
done
```

## Get all pods running on a nodegroup:

```
k get pods -A -o wide | grep -E "($(k get nodes -l eks.amazonaws.com/nodegroup=green -o json | jq -r '.items[].metadata.name' | xargs | tr ' ' '|'))"
```

## WTF is wrong with the cluster

```
kubectl get events -A --sort-by='.metadata.creationTimestamp' | less
```

## Some kind of crappy cost estimator?

```
for c in $(kubectl config get-contexts -o name); do
  kubectl config use-context $c
  total_cost=0
  while read -r instances; do
    num_instances=$(echo $instances | cut -d' ' -f1)
    instance_type=$(echo $instances | cut -d' ' -f2)
    monthly_cost=$(curl -sL "ec2.shop?filter=$instance_type" -H 'accept: json' | jq -r '.Prices[].MonthlyPrice')
    #echo "$num_instances $instance_type $monthly_cost"
    total_cost=$(printf "%.2f" $(echo "$total_cost + ( $num_instances * $monthly_cost )" | bc))
  done < <(kubectl get nodes -o json | jq -r '.items[].metadata.labels."node.kubernetes.io/instance-type"' | sort | uniq -c | sed 's/^[ ]*//')
  echo "\$${total_cost}"
done
```

## Delete all failed pods

```
k delete pods -A --field-selector=status.phase=Failed
```

## View all dockerconfig secrets

```
k get secrets -A --field-selector='type=kubernetes.io/dockerconfigjson' -o json | jq -r '.items[] | "\(.metadata.namespace) \(.metadata.name) \(.data[".dockerconfigjson"] |= @base64d | .data[".dockerconfigjson"] | fromjson.auths | .[] | .auth |= @base64d)"' | column -t
```
