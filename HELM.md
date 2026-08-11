# Guía de ejecución y pruebas con Helm y Minikube

## 0. Recuperar la aplicación después de `minikube delete` con ttl.sh

`minikube delete` elimina el nodo y todas las imágenes que se habían construido
en su Docker interno. Este procedimiento publica temporalmente las imágenes en
el registro público y anónimo [ttl.sh](https://ttl.sh/), para que el nuevo
clúster pueda descargarlas. Las imágenes caducarán después de 24 horas.

Ejecuta todos los bloques siguientes en la misma terminal WSL.

### Iniciar el nuevo clúster

```sh
cd /mnt/c/Users/jlacreul/Desktop/awesome-compose/react-express-mysql

minikube start --driver=docker
minikube addons enable metrics-server
kubectl config use-context minikube
```

### Volver al Docker normal de WSL

Si esta terminal estaba configurada para usar el Docker interno de un Minikube
anterior, elimina esas variables y comprueba la conexión:

```sh
eval "$(minikube docker-env --unset)"
docker info
```

### Construir y publicar las imágenes temporales

El identificador basado en la fecha evita colisiones con imágenes de otros
usuarios. Conserva estas variables en la misma terminal hasta terminar el
despliegue:

```sh
export TTL_ID="react-express-mysql-$(date +%Y%m%d%H%M%S)"
export FRONTEND_REPOSITORY="ttl.sh/${TTL_ID}-frontend"
export BACKEND_REPOSITORY="ttl.sh/${TTL_ID}-backend"

docker build \
  --target development \
  --tag "${FRONTEND_REPOSITORY}:24h" \
  ./frontend

docker push "${FRONTEND_REPOSITORY}:24h"

docker build \
  --target development \
  --build-arg NODE_ENV=development \
  --tag "${BACKEND_REPOSITORY}:24h" \
  ./backend

docker push "${BACKEND_REPOSITORY}:24h"
```

No incluyas contraseñas, claves API ni otros secretos dentro de las imágenes:
`ttl.sh` es un registro público.

### Desplegar con Helm usando ttl.sh

```sh
helm upgrade --install my-app . \
  --namespace app \
  --create-namespace \
  --set-string frontend.image.repository="${FRONTEND_REPOSITORY}" \
  --set-string frontend.image.tag="24h" \
  --set-string frontend.image.pullPolicy="Always" \
  --set-string backend.image.repository="${BACKEND_REPOSITORY}" \
  --set-string backend.image.tag="24h" \
  --set-string backend.image.pullPolicy="Always" \
  --atomic \
  --wait \
  --timeout 10m
```

Comprueba que todos los pods estén preparados:

```sh
kubectl get pods --namespace app
```

### Mostrar la aplicación en el navegador

Mantén esta terminal abierta:

```sh
kubectl port-forward service/frontend 3000:3000 --namespace app
```

Abre en el navegador:

```text
http://localhost:3000
```

Al pulsar `Ctrl+C` se cierra el acceso local. Después de 24 horas, los pods que
ya estén ejecutándose pueden continuar funcionando, pero Kubernetes no podrá
volver a descargar esas imágenes. Para recrear o reiniciar pods después de la
caducidad, repite esta sección para publicar imágenes nuevas y ejecutar otro
`helm upgrade`.

Esta guía está pensada para ejecutarse desde WSL, dentro del directorio del
proyecto:

```sh
cd /mnt/c/Users/jlacreul/Desktop/awesome-compose/react-express-mysql
```

No se utiliza Ingress ni es necesario modificar `/etc/hosts`. El frontend se
expone mediante un servicio NodePort llamado `frontend`; el backend y MySQL se
mantienen internos por defecto.

## 1. Comprobar los requisitos

Necesitas Docker, Minikube, kubectl y Helm 3:

```sh
docker --version
minikube version
kubectl version --client
helm version
```

Si alguno de estos comandos no existe o Docker no está iniciado, hay que
resolverlo antes de continuar.

## 2. Iniciar Minikube

```sh
minikube start --driver=docker
minikube addons enable metrics-server
kubectl config current-context
```

El último comando debe mostrar `minikube`. Metrics Server es necesario para que
los HPA puedan medir el consumo de CPU.

Comprueba el estado del clúster:

```sh
minikube status
kubectl get nodes
```

## 3. Construir las imágenes dentro de Minikube

Las imágenes del frontend y del backend son locales. Configura esta terminal
para usar el Docker interno de Minikube:

```sh
eval "$(minikube docker-env)"
```

Esta configuración solo afecta a la terminal actual. Ahora construye las dos
imágenes usando la etapa `development`, que es la que escucha en los puertos
3000 y 80:

```sh
docker build \
  --target development \
  --tag react-express-mysql-frontend:swarm \
  ./frontend

docker build \
  --target development \
  --tag react-express-mysql-backend:swarm \
  ./backend
```
eval "$(minikube docker-env --unset)"

docker image ls | grep react-express-mysql

minikube image load react-express-mysql-frontend:swarm
minikube image load react-express-mysql-backend:swarm

Confirma que Minikube puede verlas:

```sh
minikube image ls | grep react-express-mysql
```

El chart usa `imagePullPolicy: IfNotPresent`, por lo que Kubernetes utilizará
estas imágenes locales.

## 4. Validar e instalar el chart

Primero valida las plantillas:

```sh
helm lint .
helm template my-app . --namespace app >/tmp/my-app-rendered.yaml
```

Instala la aplicación:

```sh
helm upgrade --install my-app . \
  --namespace app \
  --create-namespace \
  --atomic \
  --wait \
  --timeout 10m
```

`--atomic` revierte automáticamente la instalación o actualización si algo
falla.

Mientras se ejecuta con `--wait`, Helm no muestra progreso continuamente y
puede parecer bloqueado. En otra terminal comprueba qué recurso está esperando:

```sh
kubectl get pods,pvc --namespace app
kubectl get events --namespace app --sort-by=.lastTimestamp | tail -n 30
```

Si MySQL muestra `CrashLoopBackOff`, consulta su último arranque:

```sh
kubectl logs my-app-react-express-mysql-mysql-0 \
  --namespace app \
  --previous
```

## 5. Comprobar que todos los recursos están preparados

```sh
kubectl get pods,services,statefulsets,pvc,hpa --namespace app
```

Espera hasta que todos los pods estén en estado `Running` y `Ready`. También
puedes observarlos en tiempo real:

```sh
kubectl get pods --namespace app --watch
```

Pulsa `Ctrl+C` para salir.

Si un pod falla, consulta su descripción y los logs:

```sh
kubectl get pods --namespace app
kubectl describe pod NOMBRE_DEL_POD --namespace app
kubectl logs --namespace app \
  --selector app.kubernetes.io/component=backend \
  --tail=100 \
  --prefix
```

## 6. Abrir el frontend

Para abrir la aplicación en el navegador:

```sh
minikube service frontend --namespace app
```

Desde WSL puede resultar más cómodo obtener la URL:

```sh
minikube service frontend --namespace app --url
```

Con el driver Docker, este comando puede mantener abierto un túnel. Déjalo
ejecutándose y copia la URL mostrada. En otra terminal prueba:

```sh
curl http://URL_MOSTRADA
curl http://URL_MOSTRADA/api/
```

La primera petición debe devolver el HTML de React. La segunda debe devolver un
JSON parecido a este:

```json
{"message":"Hello from MySQL 8.0.27"}
```

Esta segunda respuesta comprueba el recorrido completo:

```text
navegador/curl -> frontend -> backend -> MySQL
```

## 7. Probar el backend desde dentro del clúster

El backend es un servicio interno llamado `backend` y escucha en el puerto 80.
Comprueba su endpoint de salud:

```sh
kubectl run prueba-conectividad \
  --namespace app \
  --rm \
  --attach \
  --restart=Never \
  --image=curlimages/curl:8.12.1 \
  -- curl -fsS http://backend/healthz
```

La respuesta esperada es:

```text
I am happy and healthy
```

Comprueba también que el backend puede consultar MySQL:

```sh
kubectl run prueba-api \
  --namespace app \
  --rm \
  --attach \
  --restart=Never \
  --image=curlimages/curl:8.12.1 \
  -- curl -fsS http://backend/
```

## 8. Probar MySQL y la persistencia

Obtén dinámicamente el nombre del StatefulSet y de su pod:

```sh
MYSQL_STS=$(kubectl get statefulset \
  --namespace app \
  --selector app.kubernetes.io/component=mysql \
  --output jsonpath='{.items[0].metadata.name}')

MYSQL_POD="${MYSQL_STS}-0"
echo "$MYSQL_POD"
```

Crea un dato de prueba:

```sh
kubectl exec "$MYSQL_POD" --namespace app -- sh -c \
  'mysql -uroot -p"$(cat /run/secrets/db-password)" example \
  -e "CREATE TABLE IF NOT EXISTS helm_test (
        id INT PRIMARY KEY,
        message VARCHAR(100)
      );
      REPLACE INTO helm_test VALUES (1, '\''persistencia-ok'\'');
      SELECT * FROM helm_test;"'
```

Elimina el pod de MySQL para simular un reinicio:

```sh
kubectl delete pod "$MYSQL_POD" --namespace app
kubectl rollout status statefulset/"$MYSQL_STS" \
  --namespace app \
  --timeout 10m
```

Vuelve a consultar el dato:

```sh
MYSQL_POD="${MYSQL_STS}-0"

kubectl exec "$MYSQL_POD" --namespace app -- sh -c \
  'mysql -uroot -p"$(cat /run/secrets/db-password)" example \
  -e "SELECT * FROM helm_test;"'
```

Si aparece `persistencia-ok`, el PVC conserva correctamente los datos tras el
reinicio del pod.

## 9. Probar el HPA con carga HTTP

Los HPA del frontend y backend están desactivados durante el arranque local
para evitar que el servidor React de desarrollo escale mientras se inicializa.
Actívalos antes de esta prueba:

```sh
helm upgrade my-app . \
  --namespace app \
  --reuse-values \
  --set frontend.autoscaling.enabled=true \
  --set frontend.autoscaling.maxReplicas=4 \
  --set backend.autoscaling.enabled=true \
  --set backend.autoscaling.maxReplicas=4 \
  --atomic \
  --wait \
  --timeout 10m
```

Su configuración es:

- CPU objetivo: 70 %.
- Réplicas mínimas: 2.
- Réplicas máximas: 10.

Comprueba que Metrics Server proporciona datos:

```sh
kubectl top pods --namespace app
kubectl get hpa --namespace app
```

Metrics Server puede tardar uno o dos minutos en empezar a mostrar métricas.

Inicia un pod que genere peticiones continuas contra el frontend y, a través de
`/api/`, también contra el backend:

```sh
kubectl run generador-carga \
  --namespace app \
  --restart=Never \
  --image=busybox:1.36 \
  -- /bin/sh -c \
  'for i in $(seq 1 5); do
     while true; do
       wget -q -O- http://frontend:3000/api/ >/dev/null
     done &
   done
   wait'
```

Observa el consumo y el escalado en otra terminal:

```sh
kubectl top pods --namespace app
kubectl get deployments --namespace app
kubectl get hpa --namespace app --watch
```

### Explicación breve para el cliente

> La prueba demuestra que el autoescalado funciona correctamente. Al superar el
> frontend el objetivo del 70 % de CPU, Kubernetes aumentó automáticamente sus
> réplicas de 2 a 5. El backend se mantuvo en 2 porque permaneció por debajo del
> límite; al finalizar la carga, las réplicas se reducirán progresivamente.

Cuando termines, detén la carga:

```sh
kubectl delete pod generador-carga --namespace app
```

El escalado hacia abajo tiene una ventana de estabilización de cinco minutos,
por lo que no será inmediato.

Si `kubectl` devuelve `TLS handshake timeout`, el nodo local está saturado.
Recupera Minikube y elimina el generador en cuanto vuelva el API Server:

```sh
minikube stop
minikube start

until kubectl delete pod generador-carga \
  --namespace app \
  --ignore-not-found \
  --wait=false \
  --request-timeout=5s; do
  sleep 2
done
```

Después comprueba la recuperación:

```sh
kubectl get pods,hpa --namespace app
helm history my-app --namespace app
```

## 10. Exponer opcionalmente el backend con NodePort

El backend permanece como ClusterIP por defecto. Para exponerlo temporalmente:

```sh
helm upgrade my-app . \
  --namespace app \
  --reuse-values \
  --set backend.service.type=NodePort \
  --atomic \
  --wait
```

Obtén su URL:

```sh
minikube service backend --namespace app --url
```

No es necesario modificar DNS ni `/etc/hosts`.

Para volver a dejarlo únicamente interno:

```sh
helm upgrade my-app . \
  --namespace app \
  --reuse-values \
  --set backend.service.type=ClusterIP \
  --atomic \
  --wait
```

## 11. Probar una actualización progresiva

Construye imágenes con una etiqueta nueva. Las etiquetas versionadas permiten
saber exactamente qué versión se está desplegando:

```sh
eval "$(minikube docker-env)"

docker build \
  --target development \
  --tag react-express-mysql-frontend:v1.1.0 \
  ./frontend

docker build \
  --target development \
  --tag react-express-mysql-backend:v1.1.0 \
  ./backend
```

Actualiza la release:

```sh
helm upgrade my-app . \
  --namespace app \
  --set-string frontend.image.tag=v1.1.0 \
  --set-string backend.image.tag=v1.1.0 \
  --atomic \
  --wait \
  --timeout 10m
```

Observa el rollout:

```sh
kubectl rollout status deployment/my-app-react-express-mysql-frontend \
  --namespace app

kubectl rollout status deployment/my-app-react-express-mysql-backend \
  --namespace app

helm history my-app --namespace app
```

Los Deployments utilizan `RollingUpdate` con `maxUnavailable: 25%` y
`maxSurge: 25%`.

En producción conviene guardar la configuración en un fichero revisado, por
ejemplo `values.production.yaml`, y utilizar imágenes con etiquetas inmutables o
digests:

```sh
helm upgrade my-app . \
  --namespace app \
  --values values.production.yaml \
  --atomic \
  --wait \
  --timeout 10m
```

## 12. Probar un rollback

Consulta el historial:

```sh
helm history my-app --namespace app
```

Restaura una revisión anterior sustituyendo `2` por el número deseado:

```sh
helm rollback my-app 2 \
  --namespace app \
  --wait \
  --timeout 10m
```

Después verifica pods y servicios:

```sh
kubectl get pods,services,hpa --namespace app
```

## 13. Prueba opcional con kubestress

El siguiente comando instala el ejemplo de carga de CPU de
`bitqu/kubestress`, fijado a una revisión concreta:

```sh
kubectl apply \
  --namespace app \
  --filename https://raw.githubusercontent.com/bitqu/kubestress/fff56d64cb5905c57a44bf94ed9516ec184472cd/dep.yaml
```

Para eliminarlo:

```sh
kubectl delete deployment kube-stress --namespace app
```

Ejecuta estas pruebas únicamente en un entorno aislado. Kubestress genera CPU
en su propio Deployment; no envía tráfico HTTP a esta aplicación. Para probar
los HPA del frontend y backend utiliza el generador HTTP de la sección 9.

## 14. Detener o eliminar el entorno

Para eliminar la release:

```sh
helm uninstall my-app --namespace app
```

Para detener Minikube conservando el clúster:

```sh
minikube stop
```

Para volver a iniciarlo otro día:

```sh
minikube start
minikube addons enable metrics-server
eval "$(minikube docker-env)"
```

Para eliminar completamente el clúster local:

```sh
minikube delete
```

`minikube delete` elimina el clúster local y sus datos, incluida la base de
datos almacenada dentro de Minikube.


Desde PowerShell entra en WSL
wsl
Ejecuta dentro de WSL:
minikube status
kubectl config use-context minikube
minikube update-context

mkdir -p /mnt/c/Users/jlacreul/.kube

kubectl config view --raw --flatten --minify \
  > /mnt/c/Users/jlacreul/.kube/minikube-wsl.yaml

exit
2. Abre Freelens desde PowerShell
freelens
En Freelens:
Pulsa Add Cluster o Add from kubeconfig.
Selecciona:
C:\Users\jlacreul\.kube\minikube-wsl.yaml
Abre el clúster minikube.
Selecciona el namespace app.
Entra en Workloads → Pods.
Deberías ver los pods del frontend, backend y MySQL. No necesitas volver a ejecutar Helm ni redesplegar la aplicación.
Si aparece connection refused, vuelve a exportar el kubeconfig después de arrancar Minikube:
minikube start
minikube update-context
kubectl config view --raw --flatten --minify \
  > /mnt/c/Users/jlacreul/.kube/minikube-wsl.yaml
  Start-Process "$HOME\scoop\apps\freelens\current\Freelens.exe"




cd /mnt/c/Users/jlacreul/Desktop/awesome-compose/react-express-mysql && helm upgrade my-app . --namespace app --atomic --wait --timeout 10m


kubectl get pods -n app -l app.kubernetes.io/component=frontend -o wide


pod=$(kubectl get pods -n app -l app.kubernetes.io/component=frontend -o jsonpath="{.items[0].metadata.name}"); kubectl exec -n app "$pod" -- sh -c "id && ls -ld /code/node_modules/.cache && touch /code/node_modules/.cache/permission-check && rm /code/node_modules/.cache/permission-check


wsl kubectl exec -n app my-app-react-express-mysql-frontend-8857b9c9f-nbsrn -- id
wsl kubectl exec -n app my-app-react-express-mysql-frontend-8857b9c9f-nbsrn -- touch /code/node_modules/.cache/permission-check
wsl kubectl exec -n app my-app-react-express-mysql-frontend-8857b9c9f-nbsrn -- rm /code/node_modules/.cache/permission-check

