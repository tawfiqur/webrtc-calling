# webrtc-calling
make your OWN PRIVATE CALLING APPS. 
simple webrtc calling apps works from your browser & will run in minimum possible server resource.

Steps: 

copy the project into web server root
```
git clone https://github.com/tawfiqur/webrtc-calling.git
mv webrtc-calling/* .
```

install node packages 
'''
npm i
'''
//run socket server at server port 3000 (change the port number from server.js file if port 3000 is already in use)  
'''
npm i pm2 -g //install pm2 globally if not installed in server) 
pm2 start 'node server.js' --name webrtc
pm2 save
pm2 startup
'''

//for apache: enable proxy & proxy_wstunnel 
'''
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo systemctl restart apache2
'''
//add following lines to your apache server config 
'''
ProxyPreserveHost On
ProxyRequests Off
# Explicitly instruct Apache to pass connection upgrade strings
ProxyPassMatch ^/socket.io/(.*)transport=websocket ws://127.0.0.1:3000/socket.io/$1transport=websocket
# Enable explicit headers fallback configuration
Header always set Access-Control-Allow-Origin *
ProxyPass /socket.io/ http://127.0.0.1:3000/socket.io/ connectiontimeout=5 timeout=30 keepalive=On flushpackets=on
ProxyPassReverse /socket.io/ http://127.0.0.1:3000/socket.io/
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
'''

//test apache config
'''
sudo apachectl configtest
sudo systemctl restart apache2
'''
visit your site form two different browser. you will find you extension number at the top, dial the number from the other browser. you can talk privately.
