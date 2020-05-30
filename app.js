'use strict';

//include CommonJS module+
const lr = require("./load-runner-enterprise.js");

//load the configuration from JSON (be sure to edit for your settings)
lr.config = require("./config.json")

//set debug for more verbose messaging
lr.config.debug = true;

//use this to configure proxy support (or Fiddler/Postman debugging)
//lr.config.proxy = 'http://127.0.0.1:8866'



//This is for Step 1 - Parsing Swagger into a DevWeb script
function runNoPrompt() {
   
    //this reads a local Swagger file and makes a DevWeb script
    lr.swagger.toDevWeb("test/swagger-example.json", "test/swagger-example/");

    //you can also do the same from a URL instead
    //lr.swagger.toDevWeb("http://cyoung.us/swagger-example.json", "test/swagger-example/");
} 
runNoPrompt();  //uncomment to run step 1



//*/ This is for Step 2 - Prompt for password and execute SRL API's to upload packages (uncomment the "inquirer.prompt" line)
var questions = [{ type: 'password', name: 'pwd', message: "Please enter your LRE password" }];
var inquirer = require('inquirer');

//Can use this to alternatively hardcode the password (do not use inquirer)
//lr.config.password="<password>"; runAfterAnswer()

//use inquirer instead (more secure)
inquirer.prompt(questions).then(answers => { lr.config.password = answers['pwd'].toString(); runAfterAnswer(); }); //*/
async function runAfterAnswer() {

    var folder = "Subject\\CY\\Example"

    //make a folder if one doesn't exist (note the "await" to pause until complete)
    let d = await lr.MakeFolder(folder)


    //push a script up to the server (returns a Promise)
    let s = lr.PushScript("test/swagger-example", folder, "MyScript");
    
    //create/update a test (also a Promise)
    let t = lr.PushTest(s, folder, "MyTest", 10);
    //Alternative params - can pass numeric values if known:  lr.PushTest(199, folder, "ScottTest", 10);


    //runs a test (Promise)
    let r = await lr.RunTest(t,45)
    /* Alternative params - 
            existing test number:       lr.RunTest(276, 30)
            automatic selection:        lr.RunTest(s, 30, null, false, "Unassigned")
            hardcoded test instance:    lr.RunTest(s, 30, 155)
            hardcoded test w/last inst: lr.RunTest(255, 30, lr.GetLastInstance(255))
            force new instance create:  lr.RunTest(s, 30, null, true, "Unassigned")

        Explanation:
            RunTest(test: any, duration?: number, instance?: any, force?: boolean, testset?: string): Promise<any>

            In GUI, goto:  Test Managmenent > <SelectTest> > Edit > General Details > Assign To
            This equates to the instance parameter:
            
                null = Automatic selection  (same as clicking the "Assign To" link and auto-selecting the first entry)
                        --If (force=true) then creates a new instance using the specified testname (same as the "plus" button)
                        --If (force=false) then autoselect first instance
                            --If none exists, you would be prompted to choose the testset name (same as testset param)
                not null = Selecting instance number from list (same as hardcoded value)

    */

    console.log(r);
    
}


