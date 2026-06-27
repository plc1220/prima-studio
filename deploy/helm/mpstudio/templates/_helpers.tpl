{{- define "mpstudio.name" -}}
mpstudio
{{- end -}}

{{- define "mpstudio.labels" -}}
app.kubernetes.io/name: {{ include "mpstudio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "mpstudio.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mpstudio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

