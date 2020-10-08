const core = require('@actions/core');
const AWS = require("aws-sdk");
const fs = require("fs");

(async () => {
  try {
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
      const file = fileList[f];
      const botId = file.split(".")[0]

      let match = existingRules.Rules.find(e => e.Name == botId);
      if (!match) {
        await createCloudwatchEvents(cloudwatchevents, botId)
      } else if(match && match.State == "DISABLED") {
        await enableCloudwatchEvents(cloudwatchevents, botId)
      }
    }

    for (let f in fileListOld) {
      const file = fileListOld[f];
      const botId = file.split(".")[0]

      let match = existingRules.Rules.find(e => e.Name == botId);
      if (match) {
        await disableCloudwatchEvents(cloudwatchevents, botId)
      }
    }

    for (let f in fileListPending) {
      const file = fileListPending[f];
      const botId = file.split(".")[0]

      let match = existingRules.Rules.find(e => e.Name == botId);
      if (match) {
        await disableCloudwatchEvents(cloudwatchevents, botId)
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();


let createCloudwatchEvents = async (cloudwatchevents, bot_id) => {
  let hour = Math.floor(Math.random() * (7 - 1) + 1)
  let minutes = Math.floor(Math.random() * (59 - 1) + 1)

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

  console.info(`Creating scheduled task ${bot_id}...`);

}

let disableCloudwatchEvents = async (cloudwatchevents, bot_id) => {

  await cloudwatchevents.putRule({
    Name: bot_id,
    State: "DISABLED"
  }).promise()

  console.info(`Disabling scheduled task ${bot_id}...`);

}

let enableCloudwatchEvents = async (cloudwatchevents, bot_id) => {

  await cloudwatchevents.putRule({
    Name: bot_id,
    State: "ENABLED"
  }).promise()

  console.info(`Enabling scheduled task ${bot_id}...`);

}