{{/* vim: set filetype=mustache: */}}

{{- define "argent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "argent.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "argent.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Labels every object gets */}}
{{- define "argent.labels" -}}
helm.sh/chart: {{ include "argent.chart" . }}
{{ include "argent.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: argent
{{- end -}}

{{- define "argent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "argent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Selector labels of one component: call with (dict "root" . "component" "backend") */}}
{{- define "argent.componentSelectorLabels" -}}
{{ include "argent.selectorLabels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "argent.componentLabels" -}}
{{ include "argent.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "argent.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "argent.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Image reference: call with (dict "image" .Values.backend.image "root" .) — a digest wins over the tag */}}
{{- define "argent.image" -}}
{{- if .image.digest -}}
{{- printf "%s@%s" .image.repository .image.digest -}}
{{- else -}}
{{- printf "%s:%s" .image.repository (default .root.Chart.AppVersion .image.tag) -}}
{{- end -}}
{{- end -}}

{{/* The public host (required) and the settings derived from it */}}
{{- define "argent.host" -}}
{{- required "host is required: set it to the public host name, e.g. --set host=argent.example.com" .Values.host -}}
{{- end -}}

{{- define "argent.corsOrigin" -}}
{{- default (printf "https://%s" (include "argent.host" .)) .Values.corsOrigin -}}
{{- end -}}

{{- define "argent.issuer" -}}
{{- required "auth.issuer is required: the OIDC issuer URL of the Authentik application" .Values.auth.issuer -}}
{{- end -}}

{{- define "argent.clientId" -}}
{{- required "auth.clientId is required: the client id of the Authentik OIDC provider" .Values.auth.clientId -}}
{{- end -}}

{{- define "argent.tlsSecretName" -}}
{{- default (printf "%s-tls" (include "argent.fullname" .)) .Values.ingress.tls.secretName -}}
{{- end -}}

{{/* The CloudNativePG cluster and where the API finds its connection string */}}
{{- define "argent.cnpgName" -}}
{{- printf "%s-postgres" (include "argent.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "argent.databaseSecretName" -}}
{{- if eq .Values.database.mode "cnpg" -}}
{{- printf "%s-app" (include "argent.cnpgName" .) -}}
{{- else -}}
{{- required "database.external.existingSecret is required when database.mode=external" .Values.database.external.existingSecret -}}
{{- end -}}
{{- end -}}

{{- define "argent.databaseSecretKey" -}}
{{- if eq .Values.database.mode "cnpg" -}}uri{{- else -}}{{ .Values.database.external.existingSecretKey }}{{- end -}}
{{- end -}}

{{/* The secret with the optional CoinGecko key: an existing one, or the one this chart creates */}}
{{- define "argent.coingeckoSecretName" -}}
{{- if .Values.coingecko.existingSecret -}}
{{- .Values.coingecko.existingSecret -}}
{{- else if .Values.coingecko.apiKey -}}
{{- printf "%s-coingecko" (include "argent.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* Environment of the API (and of the migration init container, which only needs the database) */}}
{{- define "argent.databaseEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "argent.databaseSecretName" . }}
      key: {{ include "argent.databaseSecretKey" . }}
{{- end -}}

{{- define "argent.backendEnv" -}}
- name: PORT
  value: {{ .Values.backend.port | quote }}
- name: AUTHENTIK_ISSUER
  value: {{ include "argent.issuer" . | quote }}
- name: CORS_ORIGIN
  value: {{ include "argent.corsOrigin" . | quote }}
- name: AUTHENTIK_ADMIN_GROUP
  value: {{ .Values.auth.adminGroup | quote }}
- name: AUTHENTIK_IMPORT_GROUP
  value: {{ .Values.auth.importGroup | quote }}
{{ include "argent.databaseEnv" . }}
{{- with (include "argent.coingeckoSecretName" .) }}
- name: COINGECKO_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ . }}
      key: COINGECKO_API_KEY
{{- end }}
{{- with .Values.backend.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Topology spread: "auto" spreads soft over nodes; a list is used as given. Call with (dict "root" . "component" "backend" "spread" <value>) */}}
{{- define "argent.topologySpread" -}}
{{- if kindIs "string" .spread -}}
{{- if eq .spread "auto" }}
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "argent.componentSelectorLabels" (dict "root" .root "component" .component) | nindent 8 }}
{{- end }}
{{- else if .spread }}
topologySpreadConstraints:
  {{- toYaml .spread | nindent 2 }}
{{- end }}
{{- end -}}
