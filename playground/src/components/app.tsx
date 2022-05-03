import React from 'react';
import { Box, Button, Grid, TextField } from '@mui/material';

import {
  buildParser,
  opResolver,
  contextualise,
  getOperatorLookup,
  delegator,
  Collector,
} from 'arql';

import dataInstance from '../models';
import { generic, native as nativeConfigurer } from '../configuration';

import Model from './models';

const { transforms, operators } = generic();
const opMap = getOperatorLookup(operators);

// declare this once for multiple parsings
const resolve = opResolver(opMap);

const parser = buildParser(resolve);

const collector = new Collector();
nativeConfigurer(collector);

export default function App() {
  const [content, setContent] = React.useState('');
  const [results, setResults] = React.useState('');
  const [param, setParam] = React.useState<any>('');
  const [params, setParams] = React.useState<any[]>([]);
  const [error, setError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>();
  const textFieldRef = React.useRef<HTMLInputElement>();
  const [needsManualRun, setNeedsManualRun] = React.useState(false);

  const run = React.useCallback(
    async (auto: Boolean) => {
      try {
        let ast = parser.query(content);
        const contextualised = contextualise(
          ast,
          dataInstance.models,
          transforms
        );
        const delegated = delegator(contextualised);
        if (
          ((delegated.tree.type === 'query' && delegated.tree.dest) ||
            delegated.queries.some((q: any) => q.type === 'query' && q.dest)) &&
          auto
        ) {
          setNeedsManualRun(true);
          setResults('Please press "run" to execute modification queries');
          setError(true);
          return;
        }
        setNeedsManualRun(false);
        const data = await collector.run(delegated, params);
        setResults(JSON.stringify(data, null, 2));
        if (error) setError(false);
      } catch (e) {
        if (content) {
          setResults(e);
          setError(true);
        } else if (error && !content) {
          setResults('');
          setError(false);
        }
      }
    },
    [content, error, params]
  );

  React.useEffect(() => {
    run(true);
  }, [run]);

  return (
    <Grid container sx={{ height: '100vh' }}>
      <Grid item xs={6}>
        <Box>DATA</Box>
        <Model
          onChange={() => setParams([...params]) /*hack to refresh*/}
          dataInstance={dataInstance}
        />
      </Grid>
      <Grid
        item
        xs={6}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          height: '100%',
        }}
      >
        <Grid
          container
          spacing={2}
          sx={{ height: '50%', overflow: 'hidden', padding: '8px' }}
        >
          <Grid item xs={9} sx={{ height: '100%' }}>
            <Box sx={{ height: '100%', overflow: 'scroll' }}>
              <TextField
                multiline
                fullWidth
                minRows={10}
                placeholder="QUERY"
                onKeyDown={function (e) {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const pos: number =
                      inputRef.current?.selectionStart || content.length;
                    const split = [content.slice(0, pos), content.slice(pos)];
                    setContent(split.join('  '));
                    setTimeout(() => {
                      if (inputRef.current) {
                        inputRef.current.selectionStart = pos + 2;
                        inputRef.current.selectionEnd = pos + 2;
                      }
                    }, 0);
                  }
                }}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                sx={{
                  fontFamily: 'PT Mono',
                  overflow: 'scroll',
                  height: '100%',
                }}
                InputProps={{
                  sx: {
                    fontFamily: 'PT Mono',
                    height: '100%',
                    '> textarea': {
                      height: '100% !important',
                    },
                  },
                }}
                inputProps={{
                  ref: inputRef,
                }}
              />
            </Box>
          </Grid>
          <Grid
            item
            xs={3}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'stretch',
              maxHeight: '100%',
            }}
          >
            <Box>PARAMS</Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
              {params.map((p, i) => {
                return (
                  <Box sx={{ display: 'flex', marginBottom: '4px' }}>
                    <TextField size="small" key={i} disabled value={p} />
                    <Button
                      sx={{ marginLeft: '4px' }}
                      variant="outlined"
                      onClick={() =>
                        setParams(
                          params.slice(0, i).concat(params.slice(i + 1))
                        )
                      }
                    >
                      X
                    </Button>
                  </Box>
                );
              })}
              <Box sx={{ display: 'flex', marginBottom: '4px' }}>
                <TextField
                  size="small"
                  value={param}
                  onChange={(e) =>
                    setParam(
                      isNaN(e.target.value as any)
                        ? e.target.value
                        : parseFloat(e.target.value)
                    )
                  }
                />
                <Button
                  sx={{ marginLeft: '4px' }}
                  variant="outlined"
                  onClick={() => {
                    setParams(params.concat([param]));
                    setParam('');
                  }}
                >
                  Add
                </Button>
              </Box>
            </Box>
            <Button
              sx={{ width: '100%' }}
              variant="outlined"
              onClick={() => {
                run(false);
              }}
              disabled={!needsManualRun}
            >
              RUN
            </Button>
          </Grid>
        </Grid>
        <Box sx={{ height: '50%', overflow: 'scroll', padding: '8px' }}>
          <TextField
            ref={textFieldRef}
            multiline
            fullWidth
            placeholder="Results"
            error={error}
            onKeyDown={function (e) {
              e.preventDefault();
            }}
            value={results}
            sx={{
              fontFamily: 'PT Mono',
              overflow: 'scroll',
            }}
            inputProps={{
              sx: {
                fontFamily: 'PT Mono',
              },
            }}
          />
        </Box>
      </Grid>
    </Grid>
  );
}
