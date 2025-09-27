module.exports = {
  apps: [
    {
      name: 'doraemon-movies',
      script: 'npx',
      args: 'wrangler pages dev dist --d1=doraemon-production --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      // Auto restart on crash
      autorestart: true,
      // Maximum memory before restart (1GB)
      max_memory_restart: '1G',
      // Log configuration
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      // Restart delay
      restart_delay: 1000
    }
  ]
}