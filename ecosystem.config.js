module.exports = {
  apps: [
    {
      name: "mdm-backend",
      cwd: "./mdm-backend",
      script: "pm2-runner.js",
      watch: false
    },
    {
      name: "ngrok-tunnel",
      script: "ngrok.exe",
      args: "http --url nonparadoxical-justin-nonmigratory.ngrok-free.dev 3000",
      interpreter: "none",
      watch: false
    }
  ]
};
