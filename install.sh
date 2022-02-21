cd ./parser
npm i
npm run build
cd ../contextualiser
npm i
npm i ../parser
npm run build
cd ../operations
npm i
npm i ../parser
npm run build
cd ../op_resolver
npm i
npm i ../parser
npm i ../operations
npm run build
cd ../delegator
npm i
npm i ../contextualiser
npm run build
cd ../test
rm -r node_modules
rm package-lock.json
npm i
npm i ../contextualiser
npm i ../operations
npm i ../op_resolver
npm run try
cd ..
