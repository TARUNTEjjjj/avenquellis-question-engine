import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedTemplates} from '../src/advanced-templates.js';

const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const topicIds=['algebra','number-theory','combinatorics','geometry','calculus','probability'];
const make=(key,value=0.4)=>advancedTemplates.find(t=>t.key===key).make(()=>value);
function* permutations(items) {
  if (!items.length) {yield [];return;}
  for(let i=0;i<items.length;i++) for(const rest of permutations(items.filter((_,j)=>i!==j))) yield [items[i],...rest];
}
const valuation=(n,p)=>{let k=0;while(n%p===0n){n/=p;k++;}return k;};
function solveLinear(matrix,vector) {
  const a=matrix.map((row,i)=>[...row,vector[i]]),n=a.length;
  for(let c=0;c<n;c++) {
    let pivot=c;for(let row=c+1;row<n;row++)if(Math.abs(a[row][c])>Math.abs(a[pivot][c]))pivot=row;
    [a[c],a[pivot]]=[a[pivot],a[c]];
    const v=a[c][c];assert.ok(Math.abs(v)>1e-12);
    for(let j=c;j<=n;j++)a[c][j]/=v;
    for(let row=0;row<n;row++)if(row!==c){const factor=a[row][c];for(let j=c;j<=n;j++)a[row][j]-=factor*a[c][j];}
  }
  return a.map(row=>row[n]);
}

test('24 additional proof families have complete statements, solutions and balanced nuanced rubrics',()=>{
  assert.equal(advancedTemplates.length,24);
  assert.equal(new Set(advancedTemplates.map(t=>t.key)).size,24);
  for(const topic of topicIds)assert.equal(advancedTemplates.filter(t=>t.topic===topic).length,4);
  for(const template of advancedTemplates) for(const random of [0,0.1,0.5,0.9,0.999999]) {
    const q=template.make(()=>random);
    assert.ok(['advanced','olympiad'].includes(template.level));
    assert.ok(q.statement.length>80 && q.solution.length>300,template.key);
    assert.equal(q.type??'proof','proof');
    assert.ok(!Object.hasOwn(q,'answer'),'These are proof tasks, not numeric auto-score tasks');
    assert.equal(q.rubric.reduce((s,c)=>s+c.points,0),10,template.key);
    assert.equal(new Set(q.rubric.map(c=>c.id)).size,q.rubric.length);
    assert.ok(q.rubric.every(c=>Number.isInteger(c.points)&&c.points>0&&c.points<=3&&c.description.length>20));
    assert.ok(!q.statement.includes('undefined')&&!q.solution.includes('NaN'));
  }
});

test('algebra inequalities and equality cases agree with direct computations',()=>{
  for(let a=0;a<=8;a++)for(let b=0;b<=8;b++)for(let c=0;c<=8;c++){
    const gap=a**3+b**3+c**3+3*a*b*c-(a*a*b+a*a*c+b*b*a+b*b*c+c*c*a+c*c*b);
    assert.ok(gap>=0);
    const equality=(a===b&&b===c)||(a===0&&b===c)||(b===0&&a===c)||(c===0&&a===b);
    assert.equal(gap===0,equality);
  }
  for(let k=2;k<=6;k++)for(let step=0;step<=300;step++){
    const angle=2*Math.PI*step/300;
    const values=[0,1,2].map(j=>2*k*Math.cos(angle+j*2*Math.PI/3));
    close(values.reduce((s,x)=>s+x,0),0);
    close(values.reduce((s,x)=>s+x*x,0),6*k*k);
    assert.ok(Math.abs(values.reduce((s,x)=>s*x,1))<=2*k**3+1e-8);
  }
  for(const value of [0,0.5,0.999]){
    // Evaluate P from the factors in the statement: it is monic of degree n and equals −1 at each of the n
    // distinct integers that the solution names.
    const factorization=make('advanced-algebra-integer-factorization',value),{n,roots}=factorization.parameters;
    const factors=[...factorization.statement.match(/^Let P\(x\)=(.+)−1\. Prove /)[1].matchAll(/\(x ([+−]) (\d+)\)|x/g)];
    const P=x=>factors.reduce((product,[,sign,a])=>product*(sign===undefined?x:sign==='+'?x+Number(a):x-Number(a)),1)-1;
    assert.equal(factors.length,n);assert.equal(new Set(roots).size,n);
    assert.ok(factorization.solution.includes(`the ${n} distinct integers ${roots.join(', ')},`));
    for(const x of roots)assert.equal(P(x),-1);
    const {k}=make('advanced-algebra-parallelogram-function',value).parameters;
    for(let m=-15;m<=15;m++)for(let n=-15;n<=15;n++)assert.equal(k*(m+n)**2+k*(m-n)**2,2*k*m*m+2*k*n*n);
  }
});

test('number-theory claims pass exact integer checks including zeros and prime powers',()=>{
  for(let n=2n;n<=1000n;n++)assert.notEqual((2n**n-1n)%n,0n);
  for(const p of [3n,7n,11n,19n,23n])for(let x=-35n;x<=35n;x++)for(let y=-35n;y<=35n;y++)if(x||y)assert.equal(valuation(x*x+y*y,p)%2,0);
  const factorial=n=>{let f=1n;for(let i=2n;i<=n;i++)f*=i;return f;};
  for(let n=1n;n<=100n;n++){
    const central=factorial(2n*n)/factorial(n)**2n;
    assert.equal(valuation(central,2n),n.toString(2).split('').filter(x=>x==='1').length);
  }
  for(let n=2n;n<=51n;n++){
    const value=n**4n+4n**n;
    if(n%2n===0n){assert.equal(value%16n,0n);assert.ok(value>16n);}
    else{const b=2n**((n-1n)/2n),left=n*n-2n*n*b+2n*b*b,right=n*n+2n*n*b+2n*b*b;assert.equal(value,left*right);assert.ok(left>1n&&right>1n);}
  }
});

test('rectangle parity exactly characterizes every coloring of a 3 by 4 board',()=>{
  const m=3,n=4,reachable=new Set();
  for(let rows=0;rows<2**m;rows++)for(let cols=0;cols<2**n;cols++){
    let board=0;for(let i=0;i<m;i++)for(let j=0;j<n;j++)if(((rows>>i)&1)^((cols>>j)&1))board|=1<<(i*n+j);
    reachable.add(board);
  }
  for(let board=0;board<2**(m*n);board++){
    const bit=(i,j)=>(board>>(i*n+j))&1;
    let valid=true;
    for(let a=0;a<m;a++)for(let b=a+1;b<m;b++)for(let c=0;c<n;c++)for(let d=c+1;d<n;d++)if(bit(a,c)^bit(a,d)^bit(b,c)^bit(b,d))valid=false;
    assert.equal(reachable.has(board),valid);
  }
});

test('subsequence and tournament constructions succeed for exhaustive small cases',()=>{
  for(const p of permutations([1,2,3,4,5])){
    const up=p.map(()=>1),down=p.map(()=>1);
    for(let j=0;j<p.length;j++)for(let i=0;i<j;i++)if(p[i]<p[j])up[j]=Math.max(up[j],up[i]+1);else down[j]=Math.max(down[j],down[i]+1);
    assert.ok(Math.max(...up)>=3||Math.max(...down)>=3);
  }
  const n=5,edges=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)edges.push([i,j]);
  for(let mask=0;mask<2**edges.length;mask++){
    const wins=Array.from({length:n},()=>Array(n).fill(false));
    edges.forEach(([i,j],k)=>{wins[i][j]=Boolean((mask>>k)&1);wins[j][i]=!wins[i][j];});
    const path=[];for(let x=0;x<n;x++){const position=path.findIndex(v=>wins[x][v]);path.splice(position<0?path.length:position,0,x);}
    assert.equal(new Set(path).size,n);
    for(let j=0;j<n-1;j++)assert.ok(wins[path[j]][path[j+1]]);
  }
});

test('triangle-free edge bound holds across all five-vertex graphs',()=>{
  const n=5,edges=[];for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)edges.push([i,j]);
  for(let mask=0;mask<2**edges.length;mask++){
    const adjacency=Array.from({length:n},()=>Array(n).fill(false));let m=0;
    edges.forEach(([i,j],k)=>{if((mask>>k)&1){m++;adjacency[i][j]=adjacency[j][i]=true;}});
    let triangle=false;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(let k=j+1;k<n;k++)if(adjacency[i][j]&&adjacency[j][k]&&adjacency[k][i])triangle=true;
    if(!triangle)assert.ok(m<=Math.floor(n*n/4));
  }
});

test('geometry formulas and collinearity pass independent coordinate calculations',()=>{
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const foot=(p,a,b)=>{const d=[b[0]-a[0],b[1]-a[1]],t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/(d[0]**2+d[1]**2);return[a[0]+t*d[0],a[1]+t*d[1]];};
  const onCircle=angle=>[Math.cos(angle),Math.sin(angle)];
  const [A,B,C]=[0,0.9,3.4].map(onCircle);
  for(let i=0;i<120;i++){const P=onCircle(i*2*Math.PI/120+0.01),X=foot(P,A,B),Y=foot(P,B,C),Z=foot(P,C,A);close(cross(X,Y,Z),0);}
  for(const vertex of [A,B,C]){const P=vertex.map(x=>-x),X=foot(P,A,B),Y=foot(P,B,C),Z=foot(P,C,A);close(cross(X,Y,Z),0);}
  // Three distinct feet can still coincide with vertices (P antipodal to A).
  {const A=[0,1],B=[-1,0],C=[1,0],P=[0,-1];assert.deepEqual(foot(P,A,B),B);assert.deepEqual(foot(P,C,A),C);assert.deepEqual(foot(P,B,C),[0,0]);}
  for(let j=1;j<80;j++){
    const b=2+j/10,c=3+j/20,angle=0.2+j/30;
    const A=[0,0],B=[c,0],C=[b*Math.cos(angle),b*Math.sin(angle)],a=distance(B,C),s=(a+b+c)/2,area=Math.abs(cross(A,B,C))/2;
    const radius=area/s,circumradius=a*b*c/(4*area);assert.ok(circumradius>=2*radius-1e-9);
    const D=[(b*B[0]+c*C[0])/(b+c),(b*B[1]+c*C[1])/(b+c)];
    close(distance(A,D)**2,b*c*(1-a*a/(b+c)**2));
  }
  for(let u=-0.8;u<0.9;u+=0.1)for(const v of [0.4,0.7,1.1,1.5]){
    const oy=(u*u+v*v-1)/(2*v);if(Math.abs(oy)<1e-8)continue;
    const ty=-1/oy,dx=u*ty/(ty-v);if(dx<=-1||dx>=1)continue;
    close((dx+1)/(1-dx),((u+1)**2+v*v)/((u-1)**2+v*v));
  }
});

test('polynomial differential inequality and limiting area are numerically consistent',()=>{
  const multiply=(a,b)=>{const c=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>c[i+j]+=x*y));return c;};
  const derivative=a=>a.slice(1).map((x,i)=>x*(i+1));
  const evaluate=(a,x)=>a.reduceRight((p,c)=>p*x+c,0);
  for(const roots of [[-2,1],[-3,0,2],[-4,-1,2,5]]){
    const p=roots.reduce((a,r)=>multiply(a,[-r,1]),[1]),d=derivative(p),dd=derivative(d);
    for(let i=-60;i<=60;i++){const x=i/10;assert.ok(evaluate(d,x)**2-evaluate(p,x)*evaluate(dd,x)>0);}
  }
  let previous=0;
  for(const epsilon of [1,0.1,0.01,0.001]){
    let integral=0;const steps=10000;
    for(let i=0;i<steps;i++){const x=(i+0.5)/steps;integral+=(Math.sqrt(0.25+epsilon**2)-Math.sqrt((x-0.5)**2+epsilon**2))/steps;assert.ok(Math.abs((x-0.5)/Math.sqrt((x-0.5)**2+epsilon**2))<1);}
    assert.ok(integral>previous&&integral<0.25);previous=integral;
  }
  assert.ok(previous>0.249);
});

test('permutation-cycle expectation agrees with exhaustive uniform enumeration',()=>{
  for(let n=1;n<=7;n++){
    let total=0,count=0;
    for(const p of permutations(Array.from({length:n},(_,i)=>i))){
      const seen=new Set();let cycles=0;
      for(let i=0;i<n;i++)if(!seen.has(i)){cycles++;let v=i;while(!seen.has(v)){seen.add(v);v=p[v];}}
      total+=cycles;count++;
    }
    close(total/count,Array.from({length:n},(_,i)=>1/(i+1)).reduce((a,b)=>a+b,0));
  }
});

test('random-walk answers match independently solved finite-state linear systems',()=>{
  for(let n=5;n<=12;n++){
    const matrix=Array.from({length:n-1},(_,i)=>Array.from({length:n-1},(_,j)=>i===j?1:Math.abs(i-j)===1?-0.5:0));
    const expected=solveLinear(matrix,Array(n-1).fill(1));
    const probabilities=solveLinear(matrix,Array.from({length:n-1},(_,j)=>j===n-2?0.5:0));
    for(let j=1;j<n;j++){close(expected[j-1],j*(n-j));close(probabilities[j-1],j/n);}
  }
});

test('conditional parity formula agrees with weighted exhaustive subset enumeration',()=>{
  for(let n=4;n<=9;n++)for(let d=3;d<=5;d++){
    const p=1/d;let even=0,firstAndEven=0;
    for(let mask=0;mask<2**n;mask++){
      const size=mask.toString(2).split('').filter(c=>c==='1').length;
      if(size%2===0){const probability=p**size*(1-p)**(n-size);even+=probability;if(mask&1)firstAndEven+=probability;}
    }
    close(even,(1+(1-2*p)**n)/2);
    close(firstAndEven/even,p*(1-(1-2*p)**(n-1))/(1+(1-2*p)**n));
  }
  for(let a=4;a<=9;a++)for(let b=1;b<=3;b++){
    let previous=0;
    for(let k=0;k<8;k++){
      const likelihoodA=(a/(a+b))**k,likelihoodB=(b/(a+b))**k;
      const probability=(0.5*likelihoodA*a/(a+b)+0.5*likelihoodB*b/(a+b))/(0.5*likelihoodA+0.5*likelihoodB);
      close(probability,(a**(k+1)+b**(k+1))/((a+b)*(a**k+b**k)));
      assert.ok(probability>previous);previous=probability;
    }
  }
});
