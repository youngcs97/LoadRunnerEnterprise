# Make me a practice directory
mkdir practice
cd practice

# Startup DevWeb Proxy Recorder (Man in the middle)
/Applications/DevWeb/ProxyRecorder /Users/chrisyoung/Documents/GitHub/LoadRunnerEnterprise/ProxyRecorder.har 
# once started, you'll see somthing like this:
#   [19:09:19.87] Info: The Proxy Recorder is initializing. Please wait for the next message before starting your business workflow..
#   [19:09:25.15] Info: Loading script /Applications/DevWeb/addonScripts/LogFormatter.py
#   [19:09:25.15] Info: Loading script /Applications/DevWeb/addonScripts/NetworkDumper.py
#   [19:09:25.15] Info: Press any key to stop the recording
#   [19:09:25.15] Info: Proxy server listening at http://*:8156

# Make note of the listening port and be sure to set that as your Git proxy.  

# Confirm and set the git proxy details
git config --global --get http.proxy
git config --global http.proxy http://localhost:8156  

# Now fetch a project (you'll see the proxy record capture some frames)
git clone https://github.com/youngcs97/LoadRunnerEnterprise

# copy in a new file and CD into the newly fetched directory
cp ./commands.sh ./LoadRunnerEnterprise/commands.sh
cd LoadRunnerEnterprise

# add that new file with a commit
git add commands.sh
git commit -m "Adding Commands"

# push back up to the repo (should see more proxy capture frames)
git push

# Stop the proxy records and it will dump to a filename ProxyRecorder.har.
# Move and rename it to a test directory and then run the offline generator.
/Applications/DevWeb/OfflineGenerator -mode=har -level=pages /Users/chrisyoung/Documents/GitHub/LoadRunnerEnterprise/test/GitCommands.har test/GitCommands 


# Look in main.js to see the code.