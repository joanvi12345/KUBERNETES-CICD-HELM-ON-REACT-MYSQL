{{/*
Expand the chart name.
*/}}
{{- define "react-express-mysql.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a release-qualified name.
*/}}
{{- define "react-express-mysql.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Use the release namespace unless explicitly overridden.
*/}}
{{- define "react-express-mysql.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Chart label value.
*/}}
{{- define "react-express-mysql.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "react-express-mysql.labels" -}}
helm.sh/chart: {{ include "react-express-mysql.chart" . }}
app.kubernetes.io/name: {{ include "react-express-mysql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Labels that identify a component's pods.
*/}}
{{- define "react-express-mysql.selectorLabels" -}}
app.kubernetes.io/name: {{ include "react-express-mysql.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Database Secret name.
*/}}
{{- define "react-express-mysql.mysqlSecretName" -}}
{{- default (printf "%s-mysql" (include "react-express-mysql.fullname" .)) .Values.mysql.auth.existingSecret | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Backend ConfigMap name.
*/}}
{{- define "react-express-mysql.backendConfigMapName" -}}
{{- printf "%s-backend" (include "react-express-mysql.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
MySQL PersistentVolume name.
*/}}
{{- define "react-express-mysql.mysqlPersistentVolumeName" -}}
{{- default (printf "%s-mysql" (include "react-express-mysql.fullname" .)) .Values.mysql.persistence.persistentVolumeName | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
MySQL PersistentVolumeClaim name. An existing claim takes precedence.
*/}}
{{- define "react-express-mysql.mysqlPersistentVolumeClaimName" -}}
{{- if .Values.mysql.persistence.existingClaim }}
{{- .Values.mysql.persistence.existingClaim | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- default (printf "%s-mysql" (include "react-express-mysql.fullname" .)) .Values.mysql.persistence.persistentVolumeClaimName | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Build an image reference. A digest takes precedence over the tag so production
releases can be pinned to immutable image content.
*/}}
{{- define "react-express-mysql.image" -}}
{{- if .digest }}
{{- printf "%s@%s" .repository .digest }}
{{- else }}
{{- printf "%s:%s" .repository (required "an image tag is required when image.digest is empty" .tag) }}
{{- end }}
{{- end }}

{{/*
Stable service names used by in-cluster clients and Minikube commands.
*/}}
{{- define "react-express-mysql.frontendServiceName" -}}
{{- .Values.frontend.service.name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "react-express-mysql.backendServiceName" -}}
{{- .Values.backend.service.name | trunc 63 | trimSuffix "-" }}
{{- end }}
