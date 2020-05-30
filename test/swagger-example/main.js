//DevWeb script information:  https://admhelp.microfocus.com/truweb/en/latest/help/Content/DevWeb/DW-scripts.htm

load.initialize(async function () {
});

load.action("Action", async function () {

    //load the URL configuration from a file
    const url = require('./url.json');

    //Read values from parameters.yml
    var value1 = `${load.params.value1}`;
	var value2 = `${load.params.value2}`;

    //Setup WebRequest defaults
    load.WebRequest.defaults.returnBody = true;
    load.WebRequest.defaults.headers = {
        "Content-Type": "application/json; charset=utf-8"
    };


    //  <!--- NumberToWords --->
    //  Returns the word corresponding to the positive number passed as parameter. Limited to quadrillions..
    var params = {};
    let trans1 = new load.Transaction("NumberToWords");
    trans1.start();
    const webResponse1 = new load.WebRequest({
        id: 1,
        url: url.scheme+"://"+url.host+url.basePath+"/Numberconversion.wso/NumberToWords/JSON",
        method: "POST",
        headers: {"foo":"bar"},
        body: JSON.stringify( 
            {"ubiNum":"0"} 
        )
    }).sendSync();
    webResponse1.json = JSON.parse(webResponse1.body)
    trans1.stop();
    load.log('webResponse1: \n\n' + webResponse1.body + '\n\n');

    //  <!--- AllUppercaseWithToken --->
    //  Returns a string changed to uppercase adding token between characters.
    var params = {};
    let trans2 = new load.Transaction("AllUppercaseWithToken");
    trans2.start();
    const webResponse2 = new load.WebRequest({
        id: 2,
        url: url.scheme+"://"+url.host+url.basePath+"/TextCasing.wso/AllUppercaseWithToken/JSON",
        method: "POST",
        headers: {},
        body: JSON.stringify( 
            {"sAString":"zero","sToken":"-"} 
        )
    }).sendSync();
    webResponse2.json = JSON.parse(webResponse2.body)
    trans2.stop();
    load.log('webResponse2: \n\n' + webResponse2.body + '\n\n');



    //Example asserts from parameters
    //let trans0 = new load.Transaction(`Sent [${value1}]; expected [${value2}]; received [${webResponse2.json}]`);
    //trans0.start()
    //trans0.stop((webResponse2.json==value2)?load.TransactionStatus.Passed:load.TransactionStatus.Failed);


});

load.finalize(async function () {
});
