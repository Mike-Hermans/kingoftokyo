var gulp = require('gulp'),
    spawn = require('child_process').spawn,
    sass = require('gulp-sass'),
    node;

/**
 * $ gulp server
 * description: launch the server. If there's a server already running, kill it.
 */
gulp.task('server', function() {
  if (node) node.kill()
  node = spawn('node', ['index.js'], {stdio: 'inherit'})
  node.on('close', function (code) {
    if (code === 8) {
      gulp.log('Error detected, waiting for changes...');
    }
  });
});

/**
 * $ gulp
 * description: start the development environment
 */
gulp.task('default', function() {

  gulp.run('server')

  gulp.watch(['./index.js', './lib/**/*.js'], function() {
    gulp.run('server')
  })
  
  gulp.watch('./sass/**/*.scss', function() {
    return gulp.src('./sass/main.scss')
      .pipe(sass().on('error', sass.logError))
      .pipe(gulp.dest('./public/css'));
  });
});

// clean up if an error goes unhandled.
process.on('exit', function() {
    if (node) node.kill()
});