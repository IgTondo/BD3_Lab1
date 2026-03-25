FROM nginx:alpine

# Serve static HTML directly instead of running the React/Vite dev server.
COPY index.html /usr/share/nginx/html/index.html

# Configure nginx to listen on the same port used by docker-compose.
RUN printf 'server {\n  listen 5173;\n  server_name localhost;\n  root /usr/share/nginx/html;\n  index index.html;\n\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
