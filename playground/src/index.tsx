import React from 'react';
import ReactDOM from 'react-dom';
import { Grid } from '@mui/material';
import Models from './components/models';
import Query from './components/query';
import Results from './components/results';

ReactDOM.render(
  <Grid container sx={{height: '100vh'}}>
    <Grid item xs={6}>
      <Models/>
    </Grid>
    <Grid item xs={6} sx={{display: 'flex', flexDirection: 'column'}}>
      <Query/>
      <Results/>
    </Grid>
  </Grid>,
  document.getElementById('root') as HTMLElement
);