const path = require("path");
const fs = require("fs");
const debug = require("debug");
// debug.enable("Eleventy:TemplateConfig");

const UrlPattern = require("url-pattern");
const { builder } = require("@netlify/functions");
const Eleventy = require("@11ty/eleventy");

// Bundler extras, generated by the serverless plugin
const eleventyConfigFile = require("./eleventy.config.js");
const extraModules = require("./serverless-required-modules.js");
const precompiledCollections = require("./serverless-collections.json");

function getProjectDir() {
  // TODO improve with process.env.LAMBDA_TASK_ROOT? was `/var/task/` on lambda (not local)
  let paths = [
    path.join(process.cwd(), "netlify/functions/serverless/"), // netlify dev
    "/var/task/src/netlify/functions/serverless/", // netlify function absolute path
  ];

  for(let path of paths) {
    if(fs.existsSync(path)) {
      return path;
    }
  }

  throw new Error(`Couldn’t find the "netlify/functions/serverless" directory. Searched: ${paths}`);
}

function matchUrlPattern(map, path) {
  for(let url in map) {
    let pattern = new UrlPattern(url);
    let result = pattern.match(path);
    if(result) {
      return {
        pathParams: result,
        inputPath: map[url]
      };
    }
  }
  throw new Error(`No matching URL found for ${path} in ${JSON.stringify(map)}`);
}

async function getEleventyOutput(projectDir, lambdaPath, queryParams) {
  let inputDir = path.join(projectDir, "src");
  let configPath = path.join(projectDir, "eleventy.config.js");
  console.log( "Current dir:", process.cwd() );
  console.log( "Project dir:", projectDir );
  console.log( "Input dir:", inputDir );
  console.log( "Requested URL: ", lambdaPath );
  console.log( "Config path: ", configPath );

  let contentMap = require(path.join(projectDir, "map.json"));

  let { pathParams, inputPath } = matchUrlPattern(contentMap, lambdaPath);
  console.log( "Path params: ", pathParams );
  console.log( "Input path: ", inputPath );

  let elev = new Eleventy(inputPath, null, {
    configPath,
    config: function(eleventyConfig) {
      eleventyConfig.setPrecompiledCollections(precompiledCollections);

      // Add the params to Global Data
      eleventyConfig.addGlobalData("eleventy.serverless", {
        query: queryParams,
        path: pathParams
      });
    }
  });
  elev.setInputDir(inputDir);
  await elev.init();

  let json = await elev.toJSON();
  if(!json.length) {
    throw new Error("Couldn’t find any generated output from Eleventy.");
  }

  for(let entry of json) {
    if(entry.inputPath === inputPath) {
      console.log( "Content found", inputPath );
      // console.log( entry );
      return entry.content;
    }
  }

  console.log( json );
  throw new Error(`Couldn’t find any matching output from Eleventy for ${inputPath}`);
}

async function handler (event) {
  try {
    let projectDir = getProjectDir();

    // TODO is this necessary?
    if(projectDir.startsWith("/var/task/")) {
      process.chdir(projectDir);
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=UTF-8"
      },
      body: await getEleventyOutput(projectDir, event.path, event.queryStringParameters),
      isBase64Encoded: false
    };
  } catch (error) {
    console.log("Error", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
}

// exports.handler = handler;
exports.handler = builder(handler);

// For local testing
// (async function() {
//   let projectDir = path.join(process.cwd(), "netlify/functions/serverless/");
//   let content = await getEleventyOutput(projectDir, "/authors/smthdotuk/");
//   console.log( content.length, content.substr(0, 500) );
//   // console.log( content );
// })();
