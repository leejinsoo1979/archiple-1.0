const icons = require('./node_modules/react-icons/bs/index.js');
const fs = require('fs');
fs.writeFileSync('icon_source.txt', icons.BsPaintBucket.toString());
