const core = require('@actions/core');
const AWS = require("aws-sdk");
const fs = require("fs");

(async () => {
  try {
    console.info("debug mode");

    AWS.config.update({
      accessKeyId: core.getInput('aws-cloudwatch-access-key-id'),
      secretAccessKey: core.getInput('aws-cloudwatch-secret-access-key'),
      region: core.getInput('aws-region')
    });

    let cloudwatchevents = new AWS.CloudWatchEvents();
    let fileList
    let fileListOld
    let fileListPending
    let existingRules = await cloudwatchevents.listRules().promise()

    try {
      fileList        = await fs.readdirSync("./scrapers/");
      fileListOld     = await fs.readdirSync("./old/");
      fileListPending = await fs.readdirSync("./pending/");
    } catch (error) {
      core.setFailed(error.message);
    }

    for (let f in fileList) {
      let file = fileList[f];

      let match = existingRules.Rules.find(e => e.Name == file.split(".")[0]);
      console.log("current:");
      console.log(file.split(".")[0]);
      if (!match) {
        await createCloudwatchEvents(cloudwatchevents, file.split(".")[0])
      } else if(match && match.State == "DISABLED") {
        await enableCloudwatchEvents(cloudwatchevents, file.split(".")[0])
      }
    }

    for (let f in fileListOld) {
      let file = fileListOld[f];

      let match = existingRules.Rules.find(e => e.Name == file.split(".")[0]);
      console.log("old:");
      console.log(file.split(".")[0]);
      if (match) {
        await disableCloudwatchEvents(cloudwatchevents, file.split(".")[0])
      }
    }

    for (let f in fileListPending) {
      let file = fileListPending[f];

      let match = existingRules.Rules.find(e => e.Name == file.split(".")[0]);
      console.log("pending:");
      console.log(file.split(".")[0]);
      if (match) {
        await disableCloudwatchEvents(cloudwatchevents, file.split(".")[0])
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();


let createCloudwatchEvents = async (cloudwatchevents, bot_id) => {
  let hour = Math.floor(Math.random() * (7 - 1) + 1)
  let minutes = Math.floor(Math.random() * (59 - 1) + 1)

  console.log(`create event for ${bot_id}`);

  await cloudwatchevents.putRule({
    Name: bot_id,
    Description: `Scraper for bot ${bot_id}, scheduled on ${hour}:${minutes} on Friday`,
    EventBusName: "default",
    ScheduleExpression: `cron(${minutes}, ${hour}, ? ,* ,FRI, *)`,
    Tags: [{
      Key: "Scraper",
      Value: bot_id
    }]
  }).promise()

  await cloudwatchevents.putTargets({
    Rule: bot_id,
    Targets: [{
      Id: bot_id,
      Arn: core.getInput('aws-target-arn'), 
      RoleArn: core.getInput('aws-ecs-role-arn'), 
      Input: `{\"containerOverrides\":[{\"name\":\"scrapers\",\"environment\":[{\"name\":\"BOT_ID\",\"value\":\"${bot_id}\"}]}]}`,
      EcsParameters: {
        TaskDefinitionArn: core.getInput('aws-task-definition-arn'),
        LaunchType: "FARGATE",
        NetworkConfiguration: {
          awsvpcConfiguration: {
            Subnets: [
              core.getInput('aws-subnet'),
            ],
            SecurityGroups: [
              core.getInput('aws-security-group'),
            ],
            AssignPublicIp: "ENABLED"
          }
        },
      }
    }]
  }).promise()

  console.log(`Creating scheduled task ${bot_id}`);

}

let disableCloudwatchEvents = async (cloudwatchevents, bot_id) => {

  console.log(`disable event for ${bot_id}`);

  await cloudwatchevents.putRule({
    Name: bot_id,
    State: "DISABLED"
  }).promise()

  console.log(`Disabling scheduled task ${bot_id}...`);

}

let enableCloudwatchEvents = async (cloudwatchevents, bot_id) => {

  console.log(`enable event for ${bot_id}`);

  await cloudwatchevents.putRule({
    Name: bot_id,
    State: "ENABLED"
  }).promise()

  console.log(`Enabling scheduled task ${bot_id}...`);

}