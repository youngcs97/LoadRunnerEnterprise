mkdir practice
cd practice

git config --global --get http.proxy
git config --global http.proxy http://localhost:8156  

git clone https://github.com/youngcs97/LoadRunnerEnterprise

cp ./commands.sh ./LoadRunnerEnterprise/commands.sh
cd LoadRunnerEnterprise

git add commands.sh
git commit -m "Adding Commands"
git push